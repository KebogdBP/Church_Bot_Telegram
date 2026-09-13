import { z } from 'zod';
import type { BibleAnswerProvider } from './bible-answer-provider.js';

const answerSchema = z.object({ answer: z.string().min(1).max(5000), bibleReferences: z.array(z.string().min(1)).max(10), needsPastor: z.boolean(), category: z.string().min(1).max(50) });

export class OpenAIBibleAnswerProvider implements BibleAnswerProvider {
  public constructor(private readonly apiKey: string, private readonly model: string, private readonly baseUrl: string, private readonly request: typeof fetch = fetch) {}
  public async answer(question: string, churchContext?: string) {
    const response = await this.request(`${this.baseUrl}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
      model: this.model, store: false,
      instructions: `Ты осторожный библейский помощник русскоязычной церковной общины. Не называй ответ пророчеством, Божьей волей для конкретного человека или заменой пасторской помощи. Чётко отделяй текст Библии от интерпретации. Не выдумывай цитаты и ссылки. При спорных конфессиональных вопросах называй основные толкования и советуй обсудить вопрос с пастором. Контекст общины: ${churchContext || 'не задан'}`,
      input: question,
      text: { format: { type: 'json_schema', name: 'bible_answer', strict: true, schema: { type: 'object', additionalProperties: false, properties: { answer: { type: 'string' }, bibleReferences: { type: 'array', items: { type: 'string' }, maxItems: 10 }, needsPastor: { type: 'boolean' }, category: { type: 'string' } }, required: ['answer', 'bibleReferences', 'needsPastor', 'category'] } } },
    }) });
    const raw = await response.text();
    let body: { output_text?: string; error?: { message?: string } };
    try { body = JSON.parse(raw) as typeof body; } catch { body = { error: { message: raw.slice(0, 500) } }; }
    if (!response.ok) throw new Error(`OpenAI Bible assistant returned ${response.status}: ${body.error?.message ?? 'unknown error'}`);
    if (!body.output_text) throw new Error('OpenAI Bible assistant response did not contain output_text');
    return { ...answerSchema.parse(JSON.parse(body.output_text)), model: this.model };
  }
}
