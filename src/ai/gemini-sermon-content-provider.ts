import { z } from 'zod';
import type { SermonContentProvider } from './sermon-content-provider.js';
import { generateGeminiJson, type GeminiJsonClientOptions } from './gemini-json-client.js';

const contentSchema = z.object({
  summary: z.string().min(1).max(4_000),
  outline: z.array(z.object({ title: z.string().min(1).max(300), points: z.array(z.string().min(1).max(1_000)).min(1).max(8) })).min(1).max(12),
  keyThoughts: z.array(z.string().min(1).max(1_000)).min(3).max(7),
  reflectionQuestions: z.array(z.string().min(1).max(1_000)).min(2).max(5),
  followUpPosts: z.array(z.object({ thought: z.string().min(1).max(1_500), practice: z.string().min(1).max(1_000), imagePrompt: z.string().min(1).max(500) })).min(6).max(6),
});

const responseSchema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', maxLength: 4000 },
    outline: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING', maxLength: 300 }, points: { type: 'ARRAY', items: { type: 'STRING', maxLength: 1000 }, minItems: 1, maxItems: 8 } }, required: ['title', 'points'] }, minItems: 1, maxItems: 12 },
    keyThoughts: { type: 'ARRAY', items: { type: 'STRING', maxLength: 1000 }, minItems: 3, maxItems: 7 },
    reflectionQuestions: { type: 'ARRAY', items: { type: 'STRING', maxLength: 1000 }, minItems: 2, maxItems: 5 },
    followUpPosts: { type: 'ARRAY', items: { type: 'OBJECT', properties: { thought: { type: 'STRING', maxLength: 1500 }, practice: { type: 'STRING', maxLength: 1000 }, imagePrompt: { type: 'STRING', maxLength: 500 } }, required: ['thought', 'practice', 'imagePrompt'] }, minItems: 6, maxItems: 6 },
  },
  required: ['summary', 'outline', 'keyThoughts', 'reflectionQuestions', 'followUpPosts'],
};

export class GeminiSermonContentProvider implements SermonContentProvider {
  public constructor(private readonly options: GeminiJsonClientOptions) {}
  public async generate(transcript: string) {
    const output = await generateGeminiJson(this.options, [
      'Ты редактор церковной группы. Работай только с данным транскриптом.',
      'Не добавляй фактов, цитат или ссылок на Писание, которых нет в тексте.',
      'Пиши бережно, ясно и по-русски. Черновики не должны выдавать мнение модели за учение церкви.',
      'Сначала восстанови структуру всей проповеди: 1–12 пунктов, в каждом заголовок и тезисы. Затем создай 6–12 постов: законченная мысль строго из транскрипта, небольшая практика на сегодня и короткий imagePrompt для тематической иллюстрации без текста.',
    ].join(' '), transcript, responseSchema);
    const parsed = contentSchema.parse(output);
    return { ...parsed, followUpPosts: parsed.followUpPosts.map((post) => `💡 ${post.thought}\n\nПрактика: ${post.practice}\n\nИзображение: ${post.imagePrompt}`), model: this.options.model };
  }
}
