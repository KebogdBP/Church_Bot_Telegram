import { z } from 'zod';
import type { SermonContentProvider } from './sermon-content-provider.js';
import { generateGroqJson, type GroqJsonClientOptions } from './groq-json-client.js';

const stringArray = z.preprocess((value) => typeof value === 'string' ? [value] : value, z.array(z.string().min(1)));
const schema = z.object({ summary: z.string().min(1).max(4_000), outline: z.array(z.object({ title: z.string().min(1), points: stringArray })).default([]), keyThoughts: stringArray.pipe(z.array(z.string().min(1).max(1_000)).min(3).max(7)), reflectionQuestions: stringArray.pipe(z.array(z.string().min(1).max(1_000)).min(2).max(5)), followUpPosts: z.array(z.object({ thought: z.string().min(1), practice: z.string().min(1), imagePrompt: z.string().min(1) })).length(6).optional() });

const MAX_ANALYSIS_CHARS = 18_000;

function analysisContext(transcript: string): string {
  if (transcript.length <= MAX_ANALYSIS_CHARS) return transcript;
  const edge = Math.floor(MAX_ANALYSIS_CHARS / 2);
  return `${transcript.slice(0, edge)}\n\n[Средняя часть транскрипта сокращена для лимита ИИ]\n\n${transcript.slice(-edge)}`;
}

export class GroqSermonContentProvider implements SermonContentProvider {
  public constructor(private readonly options: GroqJsonClientOptions) {}
  public async generate(transcript: string) {
    const output = await generateGroqJson(this.options, 'Ты редактор церковной группы. Работай только с данным транскриптом. Не добавляй фактов и цитат. Пиши по-русски. JSON: summary, outline [{title, points}], keyThoughts, reflectionQuestions, followUpPosts [{thought, practice, imagePrompt}] (ровно 6). Полный исходный транскрипт хранится отдельно; здесь нужен устойчивый к лимиту ИИ анализ.', analysisContext(transcript));
    const parsed = schema.parse(output);
    const posts = parsed.followUpPosts ?? Array.from({ length: 6 }, (_, index) => ({ thought: parsed.keyThoughts[index % parsed.keyThoughts.length]!, practice: parsed.reflectionQuestions[index % parsed.reflectionQuestions.length]!, imagePrompt: 'Спокойная тематическая иллюстрация о надежде и вере, без текста' }));
    return { ...parsed, followUpPosts: posts.map((post) => `💡 ${post.thought}\n\nПрактика: ${post.practice}\n\nИзображение: ${post.imagePrompt}`), model: this.options.model };
  }
}
