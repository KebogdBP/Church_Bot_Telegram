import { z } from 'zod';
import type { SermonContentProvider } from './sermon-content-provider.js';
import { generateGeminiJson, type GeminiJsonClientOptions } from './gemini-json-client.js';

const contentSchema = z.object({
  summary: z.string().min(1).max(4_000),
  keyThoughts: z.array(z.string().min(1).max(1_000)).min(3).max(7),
  reflectionQuestions: z.array(z.string().min(1).max(1_000)).min(2).max(5),
  followUpPosts: z.array(z.string().min(1).max(1_500)).min(6).max(12),
});

const responseSchema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', maxLength: 4000 },
    keyThoughts: { type: 'ARRAY', items: { type: 'STRING', maxLength: 1000 }, minItems: 3, maxItems: 7 },
    reflectionQuestions: { type: 'ARRAY', items: { type: 'STRING', maxLength: 1000 }, minItems: 2, maxItems: 5 },
    followUpPosts: { type: 'ARRAY', items: { type: 'STRING', maxLength: 1500 }, minItems: 6, maxItems: 12 },
  },
  required: ['summary', 'keyThoughts', 'reflectionQuestions', 'followUpPosts'],
};

export class GeminiSermonContentProvider implements SermonContentProvider {
  public constructor(private readonly options: GeminiJsonClientOptions) {}
  public async generate(transcript: string) {
    const output = await generateGeminiJson(this.options, [
      'Ты редактор церковной группы. Работай только с данным транскриптом.',
      'Не добавляй фактов, цитат или ссылок на Писание, которых нет в тексте.',
      'Пиши бережно, ясно и по-русски. Черновики не должны выдавать мнение модели за учение церкви.',
      'Создай 6–12 самостоятельных ёмких followUpPosts: одна яркая мысль, краткое пояснение и вопрос для размышления. Не повторяйся.',
    ].join(' '), transcript, responseSchema);
    return { ...contentSchema.parse(output), model: this.options.model };
  }
}
