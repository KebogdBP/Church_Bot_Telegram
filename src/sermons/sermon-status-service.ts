import { PrismaClient, SermonPostStatus } from '@prisma/client';
import { escapeHtml } from '../messaging/html.js';
import { normalizePublicSermonId } from './public-sermon-id.js';

export type PipelineStageState = 'completed' | 'processing' | 'pending' | 'attention' | 'skipped';

export interface PipelineStage {
  key: 'received' | 'download' | 'conversion' | 'transcription' | 'analysis' | 'moderation' | 'image' | 'delivery';
  title: string;
  state: PipelineStageState;
  detail: string;
  durationMinutes?: number;
}

export interface SermonDiagnostic {
  summary: string;
  action: string;
  automaticRetry: boolean;
}

export interface SermonStatusView {
  id: string;
  fileName?: string;
  stages: PipelineStage[];
  overall: 'processing' | 'review' | 'scheduled' | 'completed' | 'attention';
  diagnostic?: SermonDiagnostic;
  canRegenerate: boolean;
  posts: { total: number; draft: number; scheduled: number; processing: number; sent: number; failed: number; rejected: number };
}

export interface SermonStatusReader {
  get(chatId: string, sermonId: string): Promise<SermonStatusView | null>;
}

export class PrismaSermonStatusReader implements SermonStatusReader {
  public constructor(private readonly prisma: PrismaClient) {}

  public async get(chatId: string, sermonId: string): Promise<SermonStatusView | null> {
    const sermon = await this.prisma.sermon.findFirst({
      where: { churchGroup: { telegramChatId: chatId }, OR: [{ id: sermonId }, { publicId: normalizePublicSermonId(sermonId) }] },
      select: {
        publicId: true, purpose: true, fileName: true, status: true, attempts: true,
        transcriptionStatus: true, transcriptionAttempts: true,
        contentStatus: true, contentAttempts: true,
        lastError: true, transcriptionError: true, contentError: true,
        createdAt: true, storedAt: true, transcribedAt: true, contentGeneratedAt: true,
        posts: { select: { status: true, attempts: true, scheduledFor: true, lastError: true } },
      },
    });
    if (!sermon) return null;

    const posts = countPosts(sermon.posts);
    const terminalPost = sermon.posts.find((post) => post.status === SermonPostStatus.FAILED && post.attempts >= 5);
    const diagnostic = buildDiagnostic({
      downloadStatus: sermon.status,
      downloadAttempts: sermon.attempts,
      transcriptionStatus: sermon.transcriptionStatus,
      transcriptionAttempts: sermon.transcriptionAttempts,
      contentStatus: sermon.contentStatus,
      contentAttempts: sermon.contentAttempts,
      error: terminalPost?.lastError ?? sermon.contentError ?? sermon.transcriptionError ?? sermon.lastError,
      terminalPostFailure: Boolean(terminalPost),
    });

    const nextScheduledFor = sermon.posts.flatMap((post) => post.scheduledFor ? [post.scheduledFor] : []).sort((a, b) => a.getTime() - b.getTime())[0];
    const stages = buildStages({
      purpose: sermon.purpose,
      downloadStatus: sermon.status,
      downloadAttempts: sermon.attempts,
      transcriptionStatus: sermon.transcriptionStatus,
      transcriptionAttempts: sermon.transcriptionAttempts,
      contentStatus: sermon.contentStatus,
      contentAttempts: sermon.contentAttempts,
      createdAt: sermon.createdAt,
      storedAt: sermon.storedAt,
      transcribedAt: sermon.transcribedAt,
      contentGeneratedAt: sermon.contentGeneratedAt,
      posts,
      ...(nextScheduledFor ? { nextScheduledFor } : {}),
      ...(diagnostic ? { diagnostic } : {}),
    });

    return {
      id: sermon.publicId,
      ...(sermon.fileName ? { fileName: sermon.fileName } : {}),
      stages,
      overall: overallState(stages, posts),
      ...(diagnostic ? { diagnostic } : {}),
      canRegenerate: sermon.transcriptionStatus === 'COMPLETED'
        && sermon.posts.every((post) => post.status === SermonPostStatus.DRAFT || post.status === SermonPostStatus.REJECTED),
      posts,
    };
  }
}

export function renderSermonStatus(status: SermonStatusView): string {
  const overallLabels: Record<SermonStatusView['overall'], string> = {
    processing: 'обрабатывается',
    review: 'ожидает проверки',
    scheduled: 'публикации запланированы',
    completed: 'готово',
    attention: 'нужно внимание',
  };
  const lines = [
    `<b>Обработка проповеди · <code>${escapeHtml(status.id)}</code></b>`,
    ...(status.fileName ? [`Файл: ${escapeHtml(status.fileName)}`] : []),
    `Общий статус: <b>${overallLabels[status.overall]}</b>`,
    '',
    ...status.stages.map((stage, index) => `${stageIcon(stage.state)} ${index + 1}. <b>${stage.title}</b>${stage.durationMinutes === undefined ? '' : ` · ${formatDuration(stage.durationMinutes)}`}\n${escapeHtml(stage.detail)}`),
  ];
  if (status.diagnostic) {
    lines.push('', '<b>Что произошло</b>', escapeHtml(status.diagnostic.summary), '', '<b>Что делать</b>', escapeHtml(status.diagnostic.action));
  }
  return lines.join('\n');
}

interface StageInput {
  purpose: 'CHURCH_SERMON' | 'PERSONAL_TRANSCRIPTION';
  downloadStatus: 'RECEIVED' | 'DOWNLOADING' | 'STORED' | 'TOO_LARGE' | 'FAILED';
  downloadAttempts: number;
  transcriptionStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  transcriptionAttempts: number;
  contentStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  contentAttempts: number;
  createdAt: Date;
  storedAt: Date | null;
  transcribedAt: Date | null;
  contentGeneratedAt: Date | null;
  posts: SermonStatusView['posts'];
  nextScheduledFor?: Date;
  diagnostic?: SermonDiagnostic;
}

function buildStages(input: StageInput): PipelineStage[] {
  const downloadTerminal = input.downloadStatus === 'TOO_LARGE' || (input.downloadStatus === 'FAILED' && input.downloadAttempts >= 5);
  const transcriptionTerminal = input.transcriptionStatus === 'FAILED' && input.transcriptionAttempts >= 5;
  const contentTerminal = input.contentStatus === 'FAILED' && input.contentAttempts >= 5;
  const personal = input.purpose === 'PERSONAL_TRANSCRIPTION';
  const postsStarted = input.posts.scheduled + input.posts.processing + input.posts.sent + input.posts.failed > 0;
  const deliveryTerminal = input.posts.failed > 0 && input.posts.scheduled + input.posts.processing === 0;

  const downloadState: PipelineStageState = input.downloadStatus === 'STORED' ? 'completed'
    : downloadTerminal ? 'attention'
      : input.downloadStatus === 'DOWNLOADING' || input.downloadStatus === 'FAILED' ? 'processing' : 'pending';
  const transcriptionState: PipelineStageState = input.transcriptionStatus === 'COMPLETED' ? 'completed'
    : transcriptionTerminal ? 'attention'
      : input.transcriptionStatus === 'PROCESSING' || input.transcriptionStatus === 'FAILED' ? 'processing' : 'pending';
  const analysisState: PipelineStageState = personal ? 'skipped'
    : input.contentStatus === 'COMPLETED' ? 'completed'
      : contentTerminal ? 'attention'
        : input.contentStatus === 'PROCESSING' || input.contentStatus === 'FAILED' ? 'processing' : 'pending';
  const moderationState: PipelineStageState = personal ? 'skipped'
    : input.posts.total === 0 ? 'pending'
      : postsStarted ? 'completed' : input.posts.draft > 0 ? 'processing' : 'attention';
  const imageState: PipelineStageState = personal ? 'skipped'
    : input.posts.sent > 0 ? 'completed'
      : input.posts.processing > 0 ? 'processing' : deliveryTerminal ? 'attention' : 'pending';
  const deliveryState: PipelineStageState = personal
    ? (input.transcriptionStatus === 'COMPLETED' ? 'completed' : transcriptionTerminal ? 'attention' : 'pending')
    : input.posts.total > 0 && input.posts.sent === input.posts.total ? 'completed'
      : deliveryTerminal ? 'attention' : input.posts.processing > 0 ? 'processing' : 'pending';

  return [
    { key: 'received', title: 'Материал принят', state: 'completed', detail: 'Запись сохранена в очереди обработки.' },
    { key: 'download', title: 'Загрузка аудио', state: downloadState, detail: stageDetail('download', downloadState, input), ...(input.storedAt ? { durationMinutes: minutesBetween(input.createdAt, input.storedAt) } : {}) },
    { key: 'conversion', title: 'Подготовка аудио', state: transcriptionState, detail: stageDetail('conversion', transcriptionState, input) },
    { key: 'transcription', title: 'Полная транскрибация', state: transcriptionState, detail: stageDetail('transcription', transcriptionState, input), ...(input.transcribedAt && input.storedAt ? { durationMinutes: minutesBetween(input.storedAt, input.transcribedAt) } : {}) },
    { key: 'analysis', title: 'Смысловой анализ', state: analysisState, detail: personal ? 'Для личной транскрибации этот этап не требуется.' : stageDetail('analysis', analysisState, input), ...(input.contentGeneratedAt && input.transcribedAt ? { durationMinutes: minutesBetween(input.transcribedAt, input.contentGeneratedAt) } : {}) },
    { key: 'moderation', title: 'Проверка служителем', state: moderationState, detail: personal ? 'Для личной транскрибации этот этап не требуется.' : moderationDetail(input.posts) },
    { key: 'image', title: 'Изображения публикаций', state: imageState, detail: personal ? 'Для личной транскрибации этот этап не требуется.' : imageDetail(imageState) },
    { key: 'delivery', title: 'Публикация', state: deliveryState, detail: deliveryDetail(input, deliveryState) },
  ];
}

function stageDetail(key: PipelineStage['key'], state: PipelineStageState, input: StageInput): string {
  if (state === 'attention') return input.diagnostic?.summary ?? 'Этап остановлен после нескольких неудачных попыток.';
  if (key === 'download') {
    if (state === 'completed') return 'Исходный файл сохранён на сервере.';
    if (state === 'processing') return `Выполняется или ожидает повторной попытки (${input.downloadAttempts}/5).`;
    return 'Ожидает загрузки из Telegram или по ссылке.';
  }
  if (key === 'conversion') {
    if (state === 'completed') return 'Аудио нормализовано и при необходимости разделено на части.';
    if (state === 'processing') return 'Идёт сжатие, нормализация и деление длинной записи.';
    return 'Начнётся после сохранения исходного файла.';
  }
  if (key === 'transcription') {
    if (state === 'completed') return 'Полный текст проповеди сохранён в архиве.';
    if (state === 'processing') return `Groq Whisper обрабатывает запись (${input.transcriptionAttempts}/5).`;
    return 'Ожидает подготовки аудио.';
  }
  if (key === 'analysis') {
    if (state === 'completed') return 'Структура, мысли, вопросы и публикации подготовлены.';
    if (state === 'processing') return `AI анализирует транскрипт (${input.contentAttempts}/5).`;
    return 'Ожидает готового транскрипта.';
  }
  return '';
}

function moderationDetail(posts: SermonStatusView['posts']): string {
  if (posts.total === 0) return 'Черновики появятся после смыслового анализа.';
  if (posts.draft > 0) return `${posts.draft} черн. ожидают просмотра и одобрения.`;
  if (posts.rejected === posts.total) return 'Все публикации отклонены служителем.';
  return 'Серия проверена; одобренные публикации переданы в расписание.';
}

function imageDetail(state: PipelineStageState): string {
  if (state === 'completed') return 'Изображения создаются при отправке; при сбое используется текстовый вариант.';
  if (state === 'processing') return 'Создаётся изображение для текущей публикации.';
  if (state === 'attention') return 'Отправка публикации остановилась; проверьте диагностику ниже.';
  return 'Начнётся автоматически в момент публикации одобренного черновика.';
}

function deliveryDetail(input: StageInput, state: PipelineStageState): string {
  if (input.purpose === 'PERSONAL_TRANSCRIPTION') return state === 'completed' ? 'Полный текст отправлен пользователю.' : 'Текст будет отправлен после транскрибации.';
  if (state === 'completed') return `Отправлено публикаций: ${input.posts.sent}.`;
  if (state === 'processing') return 'Одна из публикаций сейчас отправляется.';
  if (state === 'attention') return `${input.posts.failed} публ. не удалось отправить после повторных попыток.`;
  if (input.nextScheduledFor) return `Следующая публикация: ${input.nextScheduledFor.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}.`;
  return 'Ожидает одобрения и расписания.';
}

function buildDiagnostic(input: {
  downloadStatus: StageInput['downloadStatus'];
  downloadAttempts: number;
  transcriptionStatus: StageInput['transcriptionStatus'];
  transcriptionAttempts: number;
  contentStatus: StageInput['contentStatus'];
  contentAttempts: number;
  error: string | null;
  terminalPostFailure: boolean;
}): SermonDiagnostic | undefined {
  const downloadTerminal = input.downloadStatus === 'TOO_LARGE' || (input.downloadStatus === 'FAILED' && input.downloadAttempts >= 5);
  const transcriptionTerminal = input.transcriptionStatus === 'FAILED' && input.transcriptionAttempts >= 5;
  const contentTerminal = input.contentStatus === 'FAILED' && input.contentAttempts >= 5;
  if (!downloadTerminal && !transcriptionTerminal && !contentTerminal && !input.terminalPostFailure) return undefined;
  const error = (input.error ?? '').toLowerCase();
  if (input.downloadStatus === 'TOO_LARGE') return { summary: 'Размер файла превышает установленный лимит.', action: 'Отправьте публичную ссылку на запись или загрузите более компактный MP3/M4A.', automaticRetry: false };
  if (/private|sign in|login|forbidden|403|drm|unsupported url/.test(error)) return { summary: 'Источник не даёт боту скачать запись без авторизации.', action: 'Откройте публичный доступ или отправьте сам аудиофайл в Telegram.', automaticRetry: false };
  if (/ffmpeg|invalid data|no audio|no segments|codec|moov atom/.test(error)) return { summary: 'Файл не удалось распознать как исправную аудиозапись.', action: 'Пересохраните запись в MP3 или M4A и отправьте её заново.', automaticRetry: false };
  if (/429|rate|quota|temporar|timeout|timed out|connect|network|proxy|503|502/.test(error)) return { summary: 'Внешний AI-сервис или сеть временно недоступны.', action: 'Повторные попытки закончились. Запустите обработку заново немного позже.', automaticRetry: false };
  if (contentTerminal) return { summary: 'Транскрипт готов, но AI не смог подготовить структурированные материалы.', action: 'Нажмите «Пересобрать материалы» или повторите /sermon_regenerate с этим ID.', automaticRetry: false };
  if (transcriptionTerminal) return { summary: 'Аудио сохранено, но распознавание речи не завершилось.', action: 'Проверьте качество записи и формат; при необходимости отправьте MP3 заново.', automaticRetry: false };
  if (input.terminalPostFailure) return { summary: 'Материалы готовы, но Telegram-публикация не была доставлена.', action: 'Проверьте доступ бота к группе и повторите публикацию после восстановления связи.', automaticRetry: false };
  return { summary: 'Файл не удалось загрузить после нескольких попыток.', action: 'Отправьте файл заново или используйте публичную ссылку на запись.', automaticRetry: false };
}

function countPosts(posts: Array<{ status: SermonPostStatus }>): SermonStatusView['posts'] {
  const result = { total: posts.length, draft: 0, scheduled: 0, processing: 0, sent: 0, failed: 0, rejected: 0 };
  for (const post of posts) result[post.status.toLowerCase() as keyof Omit<typeof result, 'total'>] += 1;
  return result;
}

function overallState(stages: PipelineStage[], posts: SermonStatusView['posts']): SermonStatusView['overall'] {
  if (stages.some((stage) => stage.state === 'attention')) return 'attention';
  if (posts.total > 0 && posts.sent === posts.total) return 'completed';
  if (posts.scheduled + posts.processing + posts.sent > 0) return 'scheduled';
  if (posts.draft > 0) return 'review';
  return 'processing';
}

function stageIcon(state: PipelineStageState): string {
  return { completed: '✅', processing: '⏳', pending: '▫️', attention: '⚠️', skipped: '—' }[state];
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 мин';
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}
