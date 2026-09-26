import { PrismaClient, ReminderDeliveryStatus, TranscriptionStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaReminderRepository } from '../src/reminders/prisma-reminder-repository.js';
import { PrismaEventRepository } from '../src/events/prisma-event-repository.js';
import { PrismaSermonRepository } from '../src/sermons/prisma-sermon-repository.js';
import { PrismaTranscriptionRepository } from '../src/sermons/prisma-transcription-repository.js';
import { PrismaSermonNotificationRepository } from '../src/sermons/prisma-sermon-notification-repository.js';
import { PrismaSermonPostRepository } from '../src/sermons/prisma-sermon-post-repository.js';
import { SermonPostService } from '../src/sermons/sermon-post-service.js';
import { GuidedEventService } from '../src/admin/guided-event-service.js';
import { EventService } from '../src/events/event-service.js';
import { PrismaWeeklyDigestRepository } from '../src/digests/prisma-weekly-digest-repository.js';
import { EventRsvpService } from '../src/events/event-rsvp-service.js';
import { SermonSearchService } from '../src/sermons/sermon-search-service.js';
import { PrismaAnnouncementRepository } from '../src/announcements/prisma-announcement-repository.js';
import { PrayerRequestService } from '../src/prayers/prayer-request-service.js';
import { PrayerRequestWorker } from '../src/prayers/prayer-request-worker.js';
import { RetentionService } from '../src/retention/retention-service.js';
import { PrismaAssistantRepository } from '../src/assistant/prisma-assistant-repository.js';
import { PrismaSermonStatusReader } from '../src/sermons/sermon-status-service.js';
import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl && !new URL(databaseUrl).pathname.toLowerCase().includes('test')) {
  throw new Error('TEST_DATABASE_URL must point to a database whose name contains "test"');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('PrismaReminderRepository integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaClient();
    await prisma.sermon.deleteMany();
    await prisma.reminderDelivery.deleteMany();
    await prisma.event.deleteMany();
    await prisma.churchGroup.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('plans, claims, and completes one durable delivery', async () => {
    const group = await prisma.churchGroup.create({
      data: { telegramChatId: 'integration-chat', timezone: 'Europe/Moscow' },
    });
    const event = await prisma.event.create({
      data: {
        churchGroupId: group.id,
        title: 'Интеграционное событие',
        startsAt: new Date('2099-09-20T07:00:00.000Z'),
        timezone: 'Europe/Moscow',
        reminderMinutesBefore: 60,
        createdByTelegramUserId: 'integration-admin',
      },
    });
    const repository = new PrismaReminderRepository(prisma);
    const reminder = {
      occurrenceAt: event.startsAt,
      scheduledFor: new Date('2099-09-20T06:00:00.000Z'),
    };

    expect(await repository.plan(event.id, reminder)).toBe(true);
    expect(await repository.plan(event.id, reminder)).toBe(false);

    const claimed = await repository.claimDue(new Date('2099-09-20T06:00:01.000Z'), 10);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.event.chatId).toBe('integration-chat');

    await repository.markSent(claimed[0]!.deliveryId, new Date('2099-09-20T06:00:02.000Z'));
    const delivery = await prisma.reminderDelivery.findUniqueOrThrow({
      where: { id: claimed[0]!.deliveryId },
    });
    expect(delivery.status).toBe(ReminderDeliveryStatus.SENT);
    expect(delivery.attempts).toBe(1);

    await repository.plan(event.id, {
      occurrenceAt: new Date('2099-09-27T07:00:00.000Z'),
      scheduledFor: new Date('2099-09-27T06:00:00.000Z'),
    });
    const eventRepository = new PrismaEventRepository(prisma);
    await eventRepository.update('integration-chat', event.id, {
      title: 'Обновлённое событие',
      startsAt: new Date('2099-09-20T08:00:00.000Z'),
      reminderMinutesBefore: 120,
    });

    expect(await prisma.reminderDelivery.count({ where: { eventId: event.id } })).toBe(1);
    expect(await prisma.reminderDelivery.count({
      where: { eventId: event.id, status: ReminderDeliveryStatus.SENT },
    })).toBe(1);
  });

  it('stores sermon metadata idempotently', async () => {
    const repository = new PrismaSermonRepository(prisma);
    const input = {
      chatId: 'sermon-integration-chat',
      sourceMessageId: '100',
      submittedByUserId: '42',
      kind: 'audio' as const,
      telegramFileId: 'file-id',
      telegramFileUniqueId: 'unique-id',
      fileName: 'sermon.mp3',
      mimeType: 'audio/mpeg',
      fileSize: 4_096,
      durationSeconds: 1_800,
      title: 'О надежде',
    };

    const first = await repository.createIfNew(input, 'Europe/Moscow');
    const duplicate = await repository.createIfNew(input, 'Europe/Moscow');

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.sermon.id).toBe(first.sermon.id);
    expect(first.sermon.publicId).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    expect(duplicate.sermon.publicId).toBe(first.sermon.publicId);
    expect(duplicate.sermon.fileSize).toBe(4_096);
    const status = new PrismaSermonStatusReader(prisma);
    await expect(status.get(input.chatId, first.sermon.publicId!.toLowerCase())).resolves.toMatchObject({ id: first.sermon.publicId });
    await expect(status.get(input.chatId, first.sermon.id)).resolves.toMatchObject({ id: first.sermon.publicId });
  });

  it('claims stored audio and persists its transcript', async () => {
    const sermons = new PrismaSermonRepository(prisma);
    const transcription = new PrismaTranscriptionRepository(prisma);
    const created = await sermons.createIfNew({
      chatId: 'transcription-integration-chat',
      sourceMessageId: '200',
      kind: 'audio',
      telegramFileId: 'transcription-file-id',
      telegramFileUniqueId: 'transcription-unique-id',
      fileName: 'sunday.mp3',
      mimeType: 'audio/mpeg',
    }, 'Europe/Moscow');
    await sermons.markStored(created.sermon.id, 'audio/sunday.mp3', '/data/sunday.mp3');

    const claimed = await transcription.claimNext(new Date('2100-01-01T00:00:00Z'));
    expect(claimed).toMatchObject({ id: created.sermon.id, storedPath: '/data/sunday.mp3', attempts: 1 });

    const completedAt = new Date('2026-09-13T12:00:00Z');
    await transcription.markCompleted(created.sermon.id, 'Текст проповеди', 'test-model', completedAt);
    const stored = await prisma.sermon.findUniqueOrThrow({ where: { id: created.sermon.id } });
    expect(stored.transcriptionStatus).toBe(TranscriptionStatus.COMPLETED);
    expect(stored.transcript).toBe('Текст проповеди');
    expect(stored.transcriptionModel).toBe('test-model');
    expect(stored.transcribedAt).toEqual(completedAt);
  });

  it('retains newly processed data even when the sermon was received long ago', async () => {
    const suffix = Date.now().toString();
    const chatId = `retention-integration-${suffix}`;
    const now = new Date('2026-09-15T12:00:00Z');
    const old = new Date('2026-01-01T00:00:00Z');
    const recent = new Date('2026-09-15T11:00:00Z');
    const path = join(tmpdir(), `church-bot-retention-${suffix}.audio`);
    const group = await prisma.churchGroup.create({ data: { telegramChatId: chatId, audioRetentionDays: 30, transcriptRetentionDays: 30, prayerRetentionDays: 30 } });
    const sermon = await prisma.sermon.create({ data: { churchGroupId: group.id, sourceMessageId: suffix, createdAt: old, storedPath: path, storedAt: recent, transcript: 'свежий текст', transcribedAt: recent } });
    await writeFile(path, 'audio');
    const service = new RetentionService(prisma, () => now);

    await expect(service.preview(chatId)).resolves.toEqual({ audio: 0, transcripts: 0, prayers: 0, pendingAudioFiles: 0 });
    await prisma.sermon.update({ where: { id: sermon.id }, data: { storedAt: old, transcribedAt: old } });
    await expect(service.execute(chatId)).resolves.toEqual({ audio: 1, transcripts: 1, prayers: 0, pendingAudioFiles: 0 });
    await expect(service.execute(chatId)).resolves.toEqual({ audio: 0, transcripts: 0, prayers: 0, pendingAudioFiles: 0 });
    await expect(access(path)).rejects.toThrow();
  });

  it('persists and completes a guided event flow', async () => {
    const events = new EventService(new PrismaEventRepository(prisma), () => new Date('2026-09-14T08:00:00Z'));
    const flow = new GuidedEventService(prisma, events, 'Europe/Moscow', () => new Date('2026-09-14T08:00:00Z'));
    await flow.start('guided-chat', '42');
    expect((await flow.consume('guided-chat', '42', '2099-10-01'))?.text).toContain('время');
    expect((await flow.consume('guided-chat', '42', '10:00'))?.text).toContain('название');
    expect((await flow.consume('guided-chat', '42', 'Воскресное служение'))?.text).toContain('расскажите');
    expect((await flow.consume('guided-chat', '42', 'Служение с общей молитвой и словом наставления.'))?.text).toContain('место');
    expect((await flow.consume('guided-chat', '42', 'Главный зал'))?.text).toContain('минут');
    const imageChoice = await flow.consume('guided-chat', '42', '1020');
    expect(imageChoice?.text).toContain('изображение');
    expect((await flow.requestImage('guided-chat', '42')).forceReply).toBe(true);
    const confirmation = await flow.consumePhoto('guided-chat', '42', { fileId: 'photo-id', fileUniqueId: 'photo-unique' });
    expect(confirmation?.text).toContain('Изображение: добавлено');
    await expect(flow.confirm('guided-chat', '42')).resolves.toMatchObject({ text: expect.stringContaining('создано') });
    expect(await prisma.event.findFirstOrThrow({ where: { churchGroup: { telegramChatId: 'guided-chat' } }, select: { description: true, imageFileId: true } })).toEqual({
      description: 'Служение с общей молитвой и словом наставления.',
      imageFileId: 'photo-id',
    });
    expect(await prisma.adminFlow.count({ where: { telegramUserId: '42' } })).toBe(0);
  });

  it('regenerates sermon materials when addressed by the public id', async () => {
    const group = await prisma.churchGroup.create({ data: { telegramChatId: `regen-${Date.now()}` } });
    const sermon = await prisma.sermon.create({
      data: {
        churchGroupId: group.id,
        sourceMessageId: 'regen-public-id',
        status: 'STORED',
        transcriptionStatus: 'COMPLETED',
        transcript: 'Полный текст проповеди',
        contentStatus: 'COMPLETED',
        summary: 'Старое содержание',
      },
    });
    await prisma.sermonPost.create({ data: { sermonId: sermon.id, churchGroupId: group.id, sequence: 0, content: 'Старый черновик' } });
    const service = new SermonPostService(new PrismaSermonPostRepository(prisma), () => new Date('2026-09-27T08:00:00Z'));

    await expect(service.regenerate(group.telegramChatId, sermon.publicId, 'admin')).resolves.toBe(true);
    await expect(prisma.sermon.findUniqueOrThrow({ where: { id: sermon.id }, select: { contentStatus: true, summary: true, posts: true } })).resolves.toMatchObject({
      contentStatus: 'PENDING',
      summary: null,
      posts: [],
    });
  });
});

describeWithDatabase('PrismaSermonNotificationRepository integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaClient();
    await prisma.sermonNotification.deleteMany();
    await prisma.sermon.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('plans each completed milestone once and claims it for delivery', async () => {
    const group = await prisma.churchGroup.create({ data: { telegramChatId: `notification-${Date.now()}` } });
    const sermon = await prisma.sermon.create({
      data: {
        churchGroupId: group.id,
        sourceMessageId: '991',
        telegramFileId: 'file-notification',
        telegramFileUniqueId: 'unique-notification',
        audioKind: 'AUDIO',
        submittedByUserId: 'admin-77',
        status: 'STORED',
        transcriptionStatus: 'COMPLETED',
        contentStatus: 'COMPLETED',
      },
    });
    const repository = new PrismaSermonNotificationRepository(prisma);
    const now = new Date('2026-09-14T12:00:00Z');

    expect(await repository.planMilestones(now)).toBe(3);
    expect(await repository.planMilestones(now)).toBe(0);
    const claimed = await repository.claimDue(now, 10);

    expect(claimed).toHaveLength(3);
    expect(claimed.every((item) => item.targetChatId === 'admin-77')).toBe(true);
    await Promise.all(claimed.map((item) => repository.markSent(item.id, now)));
    expect(await prisma.sermonNotification.count({ where: { sermonId: sermon.id, status: 'SENT' } })).toBe(3);

    await prisma.churchGroup.delete({ where: { id: group.id } });
  });

  it('plans transcript text messages for personal audio without Gemini materials', async () => {
    const group = await prisma.churchGroup.create({ data: { telegramChatId: `personal-audio-${Date.now()}` } });
    const sermon = await prisma.sermon.create({ data: { churchGroupId: group.id, sourceMessageId: 'personal-1', submittedByUserId: 'member-1', purpose: 'PERSONAL_TRANSCRIPTION', status: 'STORED', transcriptionStatus: 'COMPLETED', transcript: `Начало ${'слово '.repeat(700)} конец`, contentStatus: 'PENDING' } });
    const repository = new PrismaSermonNotificationRepository(prisma);
    const now = new Date('2026-09-14T12:00:00Z');
    await repository.planMilestones(now);
    const rows = await prisma.sermonNotification.findMany({ where: { sermonId: sermon.id }, orderBy: { availableAt: 'asc' } });
    expect(rows.some((row) => row.kind.startsWith('transcript_'))).toBe(true);
    expect(rows.some((row) => row.kind === 'content_ready')).toBe(false);
    expect(rows.filter((row) => row.kind.startsWith('transcript_')).map((row) => row.message).join('')).toContain('Начало');
    await prisma.churchGroup.delete({ where: { id: group.id } });
  });

  it('audits draft moderation and regenerates only unpublished series', async () => {
    const chatId = `moderation-${Date.now()}`;
    const group = await prisma.churchGroup.create({ data: { telegramChatId: chatId } });
    const sermon = await prisma.sermon.create({
      data: {
        churchGroupId: group.id, sourceMessageId: 'moderation-1', status: 'STORED',
        transcriptionStatus: 'COMPLETED', transcript: 'Текст', contentStatus: 'COMPLETED',
        posts: { create: [{ sequence: 0, content: 'Первый', churchGroupId: group.id }, { sequence: 1, content: 'Второй', churchGroupId: group.id }] },
      },
      include: { posts: { orderBy: { sequence: 'asc' } } },
    });
    const repository = new PrismaSermonPostRepository(prisma);
    const now = new Date('2026-09-14T15:00:00Z');

    expect(await repository.editDraft(chatId, sermon.posts[0]!.id, 'Исправленный', 'admin-1', now)).toBe(true);
    expect(await repository.rejectDraft(chatId, sermon.posts[1]!.id, 'admin-2', now)).toBe(true);
    const edited = await prisma.sermonPost.findUniqueOrThrow({ where: { id: sermon.posts[0]!.id } });
    expect(edited).toMatchObject({ content: 'Исправленный', editedByUserId: 'admin-1', editedAt: now });

    expect(await repository.regenerate(chatId, sermon.id, 'admin-3', now)).toBe(true);
    expect(await prisma.sermonPost.count({ where: { sermonId: sermon.id } })).toBe(0);
    expect(await prisma.sermon.findUniqueOrThrow({ where: { id: sermon.id } })).toMatchObject({
      contentStatus: 'PENDING', contentAttempts: 0, regeneratedByUserId: 'admin-3', regeneratedAt: now,
    });

    await prisma.churchGroup.delete({ where: { id: group.id } });
  });

  it('schedules an approved sermon series three times per local day', async () => {
    const chatId = `sermon-cadence-${Date.now()}`;
    const group = await prisma.churchGroup.create({ data: { telegramChatId: chatId, timezone: 'Europe/Moscow' } });
    const sermon = await prisma.sermon.create({
      data: {
        churchGroupId: group.id, sourceMessageId: 'cadence-1', status: 'STORED', transcriptionStatus: 'COMPLETED', contentStatus: 'COMPLETED',
        posts: { create: Array.from({ length: 4 }, (_, sequence) => ({ sequence, content: `Мысль ${sequence + 1}`, churchGroupId: group.id })) },
      },
      include: { posts: { orderBy: { sequence: 'asc' } } },
    });
    const repository = new PrismaSermonPostRepository(prisma);
    expect(await repository.approveSeries(chatId, sermon.posts[0]!.id, 'admin-1', new Date('2026-09-20T17:00:00Z'))).toBe(4);
    const scheduled = await prisma.sermonPost.findMany({ where: { sermonId: sermon.id }, orderBy: { sequence: 'asc' }, select: { scheduledFor: true } });
    expect(scheduled.map((post) => post.scheduledFor)).toEqual([
      new Date('2026-09-21T06:00:00Z'), new Date('2026-09-21T11:00:00Z'), new Date('2026-09-21T16:00:00Z'), new Date('2026-09-22T06:00:00Z'),
    ]);
    await prisma.churchGroup.delete({ where: { id: group.id } });
  });

  it('builds, approves, and claims one moderated weekly digest', async () => {
    const chatId = `digest-${Date.now()}`;
    const group = await prisma.churchGroup.create({ data: { telegramChatId: chatId, digestEnabled: true, digestWeekday: 1, digestLocalTime: '08:00' } });
    await prisma.event.create({ data: { churchGroupId: group.id, title: 'Молитвенное собрание', startsAt: new Date('2026-09-16T16:00:00Z'), timezone: 'Europe/Moscow', reminderMinutesBefore: 60, createdByTelegramUserId: 'admin' } });
    await prisma.event.create({ data: { churchGroupId: group.id, title: 'Прошедшее событие', startsAt: new Date('2026-09-01T16:00:00Z'), timezone: 'Europe/Moscow', reminderMinutesBefore: 60, createdByTelegramUserId: 'admin' } });
    const sermon = await prisma.sermon.create({ data: { churchGroupId: group.id, sourceMessageId: 'digest-sermon', status: 'STORED', transcriptionStatus: 'COMPLETED', contentStatus: 'COMPLETED' } });
    await prisma.sermonPost.create({ data: { sermonId: sermon.id, churchGroupId: group.id, sequence: 0, content: 'Храните надежду', status: 'SENT', approvedAt: new Date('2026-09-13T10:00:00Z') } });
    const repository = new PrismaWeeklyDigestRepository(prisma);
    const now = new Date('2026-09-14T12:00:00Z');

    const draft = await repository.createOrRefreshDraft(chatId, now);
    expect(draft.content).toContain('Молитвенное собрание');
    expect(draft.content).not.toContain('Прошедшее событие');
    expect(draft.content).toContain('Храните надежду');
    expect(await repository.approve(chatId, draft.id, 'admin-1', now)).toBe(true);
    const claimed = await repository.claimDue(now, 5);
    expect(claimed).toEqual([expect.objectContaining({ id: draft.id, chatId })]);
    await repository.markSent(draft.id, now);
    expect((await repository.createOrRefreshDraft(chatId, now)).status).toBe('sent');

    await prisma.churchGroup.delete({ where: { id: group.id } });
  });

  it('stores one current RSVP per member and returns aggregate counts', async () => {
    const chatId = `rsvp-${Date.now()}`;
    const group = await prisma.churchGroup.create({ data: { telegramChatId: chatId } });
    const event = await prisma.event.create({ data: { churchGroupId: group.id, title: 'Служение', startsAt: new Date('2099-09-20T07:00:00Z'), timezone: 'Europe/Moscow', reminderMinutesBefore: 60, createdByTelegramUserId: 'admin' } });
    const service = new EventRsvpService(prisma);

    expect(await service.respond(chatId, event.id, 'member-1', 'going')).toEqual({ going: 1, maybe: 0, notGoing: 0 });
    expect(await service.respond(chatId, event.id, 'member-1', 'maybe')).toEqual({ going: 0, maybe: 1, notGoing: 0 });
    expect(await service.respond(chatId, event.id, 'member-2', 'going')).toEqual({ going: 1, maybe: 1, notGoing: 0 });
    expect(await prisma.eventRsvp.count({ where: { eventId: event.id } })).toBe(2);
    await expect(service.respond('another-chat', event.id, 'member-3', 'going')).resolves.toBeNull();
    const past = await prisma.event.create({ data: { churchGroupId: group.id, title: 'Прошло', startsAt: new Date('2020-01-01T00:00:00Z'), timezone: 'Europe/Moscow', reminderMinutesBefore: 60, createdByTelegramUserId: 'admin' } });
    await expect(service.respond(chatId, past.id, 'member-3', 'going')).resolves.toBeNull();

    await prisma.churchGroup.delete({ where: { id: group.id } });
  });

  it('searches only real transcripts from the current group', async () => {
    const target = await prisma.churchGroup.create({ data: { telegramChatId: `search-target-${Date.now()}` } });
    const other = await prisma.churchGroup.create({ data: { telegramChatId: `search-other-${Date.now()}` } });
    const common = { status: 'STORED' as const, transcriptionStatus: 'COMPLETED' as const, contentStatus: 'PENDING' as const };
    await prisma.sermon.create({ data: { churchGroupId: target.id, sourceMessageId: 'search-1', title: 'О надежде', transcript: 'Мы знаем, что надежда не постыжает и укрепляет церковь.', ...common } });
    await prisma.sermon.create({ data: { churchGroupId: other.id, sourceMessageId: 'search-2', title: 'Чужая проповедь', transcript: 'Надежда в другой общине.', ...common } });
    const service = new SermonSearchService(prisma);

    const results = await service.search(target.telegramChatId, 'НАДЕЖДА');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ title: 'О надежде', excerpt: expect.stringContaining('надежда не постыжает') });
    const context = await service.searchContext(target.telegramChatId, 'Как надежда укрепляет церковь?');
    expect(context).toHaveLength(1);
    expect(context[0]?.sermonId).toBe(results[0]?.sermonId);

    await prisma.churchGroup.deleteMany({ where: { id: { in: [target.id, other.id] } } });
  });

  it('moderates and durably claims an announcement', async () => {
    const chatId = `announcement-${Date.now()}`;
    const repository = new PrismaAnnouncementRepository(prisma);
    const now = new Date('2026-09-15T10:00:00Z');
    const draft = await repository.create(chatId, 'admin-1', 'Первоначальный текст', 'Europe/Moscow');
    expect(await repository.edit(chatId, draft.id, 'admin-2', 'Исправленный текст', now)).toBe(true);
    expect(await repository.approve(chatId, draft.id, 'admin-3', now, now)).toBe(true);
    expect(await repository.edit(chatId, draft.id, 'admin-4', 'Поздняя правка', now)).toBe(false);
    const claimed = await repository.claimDue(now, 10);
    expect(claimed).toEqual([expect.objectContaining({ id: draft.id, chatId, content: 'Исправленный текст' })]);
    await repository.markSent(draft.id, now);
    const stored = await prisma.announcement.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored).toMatchObject({ status: 'SENT', editedByUserId: 'admin-2', approvedByUserId: 'admin-3' });
    await prisma.churchGroup.delete({ where: { telegramChatId: chatId } });
  });

  it('keeps prayer text private until an anonymized draft is approved', async () => {
    const chatId = `prayer-${Date.now()}`;
    await prisma.churchGroup.create({ data: { telegramChatId: chatId } });
    const service = new PrayerRequestService(prisma, () => new Date('2026-09-15T10:00:00Z'));
    const request = await service.submit(chatId, 'member-1', 'Личная исходная просьба', true);
    expect(request).not.toBeNull();
    expect(await service.approveAnonymous(request!.id, 'admin-1', 'Просьба о поддержке семьи')).toBe(true);
    const sender = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const worker = new PrayerRequestWorker({ prisma, sender, now: () => new Date('2026-09-15T10:00:00Z'), intervalMs: 15_000, logger: { error: vi.fn(), warn: vi.fn() } });
    await worker.tick();
    expect(sender.sendMessage).toHaveBeenCalledWith({ chatId, text: expect.stringContaining('Просьба о поддержке семьи') });
    expect(sender.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Личная исходная просьба') }));
    expect((await prisma.prayerRequest.findUniqueOrThrow({ where: { id: request!.id } })).status).toBe('PUBLISHED');
    await prisma.churchGroup.delete({ where: { telegramChatId: chatId } });
  });

  it('stores conversation history encrypted and clears it per user', async () => {
    const chatId = `assistant-history-${Date.now()}`;
    const repository = new PrismaAssistantRepository(prisma, 'integration-privacy-secret');
    await repository.appendExchange(chatId, 'user-hash-1', 'Кто такой Павел?', 'Он был апостолом.', 'Europe/Moscow');
    const group = await prisma.churchGroup.findUniqueOrThrow({ where: { telegramChatId: chatId } });
    const stored = await prisma.assistantConversationTurn.findMany({ where: { churchGroupId: group.id }, orderBy: { createdAt: 'asc' } });
    expect(stored).toHaveLength(2);
    expect(stored.map((turn) => turn.contentEncrypted).join(' ')).not.toContain('Павел');
    await expect(repository.getHistory(chatId, 'user-hash-1', 20)).resolves.toEqual([
      { role: 'user', content: 'Кто такой Павел?' },
      { role: 'assistant', content: 'Он был апостолом.' },
    ]);
    await repository.clearHistory(chatId, 'user-hash-1');
    await expect(repository.getHistory(chatId, 'user-hash-1', 20)).resolves.toEqual([]);
    await prisma.churchGroup.delete({ where: { id: group.id } });
  });
});
