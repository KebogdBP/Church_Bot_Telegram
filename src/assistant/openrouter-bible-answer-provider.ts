import { z } from 'zod';
import type { BibleAnswerProvider, ConversationTurn, SermonAnswerContext } from './bible-answer-provider.js';
import { OpenRouterClient, type OpenRouterClientOptions } from '../ai/openrouter-client.js';

const schema = z.object({
  answer: z.string().min(1).max(3_200),
  bibleReferences: z.array(z.string().min(1).max(80)).max(10),
  needsPastor: z.boolean(),
  category: z.string().min(1).max(50),
  sermonSourceIds: z.array(z.string().min(1).max(80)).max(3),
});

export class OpenRouterBibleAnswerProvider implements BibleAnswerProvider {
  private readonly client: OpenRouterClient;

  public constructor(private readonly options: OpenRouterClientOptions & { model: string }) {
    this.client = new OpenRouterClient(options);
  }

  public async answer(question: string, churchContext?: string, sermonContext: SermonAnswerContext[] = [], history: ConversationTurn[] = []) {
    const archive = sermonContext.length
      ? sermonContext.map((item) => `[${item.sermonId}] ${item.title}: ${item.excerpt}`).join('\n')
      : 'не предоставлен';
    const messages = [
      {
        role: 'system' as const,
        content: 'Ты осторожный библейский помощник. Не выдавай ответ за пророчество, не заменяй пастора и не выдумывай цитаты. Отвечай по-русски. Возвращай только JSON с полями answer, bibleReferences, needsPastor, category, sermonSourceIds. Цитируй только ID проповедей из переданного архива. Контекст общины: ' + (churchContext || 'не задан') + '\nАрхив:\n' + archive,
      },
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user' as const, content: question },
    ];
    const output = await this.client.chat(this.options.model, messages, { type: 'json_object' });
    return { ...schema.parse(JSON.parse(stripJsonFence(output))), model: this.options.model };
  }
}

function stripJsonFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}
