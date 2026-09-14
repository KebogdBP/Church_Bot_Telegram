import { z } from 'zod';
import type { SermonContentProvider } from './sermon-content-provider.js';
import { generateGroqJson, type GroqJsonClientOptions } from './groq-json-client.js';

const schema = z.object({ summary: z.string().min(1).max(4_000), keyThoughts: z.array(z.string().min(1).max(1_000)).min(3).max(7), reflectionQuestions: z.array(z.string().min(1).max(1_000)).min(2).max(5), followUpPosts: z.array(z.string().min(1).max(3_500)).min(2).max(4) });

export class GroqSermonContentProvider implements SermonContentProvider {
  public constructor(private readonly options: GroqJsonClientOptions) {}
  public async generate(transcript: string) {
    const output = await generateGroqJson(this.options, 'Ты редактор церковной группы. Работай только с транскриптом, не добавляй фактов и цитат. Пиши по-русски. JSON: summary string, keyThoughts 3-7 strings, reflectionQuestions 2-5 strings, followUpPosts 2-4 strings.', transcript);
    return { ...schema.parse(output), model: this.options.model };
  }
}
