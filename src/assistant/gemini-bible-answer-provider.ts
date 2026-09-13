import { z } from 'zod';
import type { BibleAnswerProvider } from './bible-answer-provider.js';
import { generateGeminiJson, type GeminiJsonClientOptions } from '../ai/gemini-json-client.js';

const answerSchema = z.object({ answer: z.string().min(1).max(3_200), bibleReferences: z.array(z.string().min(1).max(80)).max(10), needsPastor: z.boolean(), category: z.string().min(1).max(50) });
const responseSchema = { type: 'OBJECT', properties: { answer: { type: 'STRING', maxLength: 3200 }, bibleReferences: { type: 'ARRAY', items: { type: 'STRING', maxLength: 80 }, maxItems: 10 }, needsPastor: { type: 'BOOLEAN' }, category: { type: 'STRING', maxLength: 50 } }, required: ['answer', 'bibleReferences', 'needsPastor', 'category'] };

export class GeminiBibleAnswerProvider implements BibleAnswerProvider {
  public constructor(private readonly options: GeminiJsonClientOptions) {}
  public async answer(question: string, churchContext?: string) {
    const output = await generateGeminiJson(this.options, `Ты осторожный библейский помощник русскоязычной церковной общины. Не называй ответ пророчеством, Божьей волей для конкретного человека или заменой пасторской помощи. Чётко отделяй текст Библии от интерпретации. Не выдумывай цитаты и ссылки. При спорных конфессиональных вопросах называй основные толкования и советуй обсудить вопрос с пастором. Контекст общины: ${churchContext || 'не задан'}`, question, responseSchema);
    return { ...answerSchema.parse(output), model: this.options.model };
  }
}
