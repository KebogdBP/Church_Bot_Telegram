import { z } from 'zod';
import type { SermonContentProvider } from './sermon-content-provider.js';
import { generateGroqJson, type GroqJsonClientOptions } from './groq-json-client.js';

const schema = z.object({ summary: z.string().min(1).max(4_000), outline: z.array(z.object({ title: z.string().min(1), points: z.array(z.string().min(1)).min(1) })).min(1), keyThoughts: z.array(z.string().min(1).max(1_000)).min(3).max(7), reflectionQuestions: z.array(z.string().min(1).max(1_000)).min(2).max(5), followUpPosts: z.array(z.object({ thought: z.string().min(1), practice: z.string().min(1), imagePrompt: z.string().min(1) })).min(6).max(12) });

export class GroqSermonContentProvider implements SermonContentProvider {
  public constructor(private readonly options: GroqJsonClientOptions) {}
  public async generate(transcript: string) {
    const output = await generateGroqJson(this.options, 'Ты редактор церковной группы. Работай только с полным транскриптом, не добавляй фактов и цитат. Пиши по-русски. JSON: summary, outline [{title, points}], keyThoughts, reflectionQuestions, followUpPosts [{thought, practice, imagePrompt}] (6-12).', transcript);
    const parsed = schema.parse(output);
    return { ...parsed, followUpPosts: parsed.followUpPosts.map((post) => `💡 ${post.thought}\n\nПрактика: ${post.practice}\n\nИзображение: ${post.imagePrompt}`), model: this.options.model };
  }
}
