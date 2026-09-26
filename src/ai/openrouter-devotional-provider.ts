import { z } from 'zod';
import { OpenRouterClient, type OpenRouterClientOptions } from './openrouter-client.js';
import { isReadableRussian } from './language-policy.js';

export const devotionalSchema = z.object({
  scriptureReference: z.string().min(1).max(120),
  scriptureText: z.string().min(1).max(280),
  reflection: z.string().min(1).max(650),
  sermonConnection: z.string().min(1).max(350),
  practice: z.string().min(1).max(240),
  prayer: z.string().min(1).max(300),
  question: z.string().min(1).max(180),
  imagePrompt: z.string().min(1).max(600),
});

export type Devotional = z.infer<typeof devotionalSchema>;

export class OpenRouterDevotionalProvider {
  private readonly client: OpenRouterClient;
  public constructor(private readonly options: OpenRouterClientOptions & { model: string }) {
    this.client = new OpenRouterClient(options);
  }

  public async generate(context: string): Promise<Devotional & { model: string }> {
    const messages = [
      {
        role: 'system' as const,
        content: [
          'Ты редактор глубокого христианского утреннего devotional для чтения в Telegram с телефона.',
          'Все видимые читателю поля — scriptureReference, scriptureText, reflection, sermonConnection, practice, prayer и question — пиши исключительно на естественном русском языке. Не смешивай русский и английский. Английский допустим только в техническом поле imagePrompt.',
          'Верни только JSON с полями scriptureReference, scriptureText, reflection, sermonConnection, practice, prayer, question, imagePrompt.',
          'Текст должен быть ёмким, спокойным и содержательным: весь devotional примерно 750–1100 знаков, без воды, повторов и общих фраз.',
          'scriptureText — одна короткая цитата или точный пересказ; reflection — 2–3 коротких абзаца; sermonConnection — одно предложение; practice — одно конкретное действие; prayer — 1–2 предложения; question — один глубокий вопрос.',
          'Выбирай уместный библейский отрывок. Не выдавай выдуманные слова за дословную цитату: если не уверен в формулировке, прямо укажи, что это краткий пересказ.',
          'Не добавляй богословски спорных категоричных утверждений.',
          'imagePrompt напиши по-английски: выразительная, взрослая, фотореалистичная горизонтальная иллюстрация по главной теме дня, с естественным светом, без людей крупным планом, без букв, надписей, логотипов и водяных знаков.',
        ].join(' '),
      },
      { role: 'user' as const, content: `Контекст последних проповедей:\n${context}` },
    ];
    const content = await this.client.chat(this.options.model, messages, { type: 'json_object' });
    let devotional = devotionalSchema.parse(JSON.parse(stripJsonFence(content)));
    if (!devotionalIsRussian(devotional)) {
      const corrected = await this.client.chat(this.options.model, [
        {
          role: 'system',
          content: 'Исправь JSON devotional. Переведи scriptureReference, scriptureText, reflection, sermonConnection, practice, prayer и question на естественный русский язык без англо-русской смеси. Сохрани смысл и ограничения длины. imagePrompt оставь на английском. Верни только JSON с теми же полями.',
        },
        { role: 'user', content: JSON.stringify(devotional) },
      ], { type: 'json_object' });
      devotional = devotionalSchema.parse(JSON.parse(stripJsonFence(corrected)));
      if (!devotionalIsRussian(devotional)) throw new Error('Devotional provider returned non-Russian reader content');
    }
    return { ...devotional, model: this.options.model };
  }
}

function devotionalIsRussian(value: Devotional): boolean {
  return isReadableRussian([
    value.scriptureReference,
    value.scriptureText,
    value.reflection,
    value.sermonConnection,
    value.practice,
    value.prayer,
    value.question,
  ].join('\n'));
}

function stripJsonFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}
