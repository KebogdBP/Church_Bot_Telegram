import { z } from 'zod';
import type { SermonContentProvider } from './sermon-content-provider.js';

const contentSchema = z.object({
  summary: z.string().min(1),
  keyThoughts: z.array(z.string().min(1)).min(3).max(7),
  reflectionQuestions: z.array(z.string().min(1)).min(2).max(5),
  followUpPosts: z.array(z.string().min(1)).min(2).max(4),
});

export class OpenAISermonContentProvider implements SermonContentProvider {
  public constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  public async generate(transcript: string) {
    const response = await this.request(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        store: false,
        instructions: [
          'Ты редактор церковной группы. Работай только с данным транскриптом.',
          'Не добавляй фактов, цитат или ссылок на Писание, которых нет в тексте.',
          'Пиши бережно, ясно и по-русски. Черновики не должны выдавать мнение модели за учение церкви.',
        ].join(' '),
        input: transcript,
        text: {
          format: {
            type: 'json_schema',
            name: 'sermon_content',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                summary: { type: 'string' },
                keyThoughts: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 7 },
                reflectionQuestions: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5 },
                followUpPosts: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
              },
              required: ['summary', 'keyThoughts', 'reflectionQuestions', 'followUpPosts'],
            },
          },
        },
      }),
    });
    const raw = await response.text();
    let body: { output_text?: string; error?: { message?: string } };
    try { body = JSON.parse(raw) as typeof body; } catch { body = { error: { message: raw.slice(0, 500) } }; }
    if (!response.ok) throw new Error(`OpenAI content generation returned ${response.status}: ${body.error?.message ?? 'unknown error'}`);
    if (!body.output_text) throw new Error('OpenAI content response did not contain output_text');
    return { ...contentSchema.parse(JSON.parse(body.output_text)), model: this.model };
  }
}
