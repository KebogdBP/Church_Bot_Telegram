import { z } from 'zod';
import { OpenRouterClient, type OpenRouterClientOptions } from './openrouter-client.js';

export const devotionalSchema = z.object({
  scriptureReference: z.string().min(1).max(120),
  scriptureText: z.string().min(1).max(900),
  reflection: z.string().min(1).max(2_000),
  sermonConnection: z.string().min(1).max(1_200),
  practice: z.string().min(1).max(800),
  prayer: z.string().min(1).max(1_000),
  question: z.string().min(1).max(400),
});

export type Devotional = z.infer<typeof devotionalSchema>;

export class OpenRouterDevotionalProvider {
  private readonly client: OpenRouterClient;
  public constructor(private readonly options: OpenRouterClientOptions & { model: string }) {
    this.client = new OpenRouterClient(options);
  }

  public async generate(context: string): Promise<Devotional & { model: string }> {
    const content = await this.client.chat(this.options.model, [
      {
        role: 'system',
        content: 'Ты редактор христианского утреннего devotional на русском языке. Верни только JSON с полями scriptureReference, scriptureText, reflection, sermonConnection, practice, prayer, question. Выбирай уместный библейский отрывок, не выдавай выдуманные слова за дословную цитату: если не уверен в точной формулировке, используй краткий пересказ и явно не называй его цитатой. Не добавляй богословски спорных категоричных утверждений.',
      },
      { role: 'user', content: `Контекст последних проповедей:\n${context}` },
    ], { type: 'json_object' });
    return { ...devotionalSchema.parse(JSON.parse(stripJsonFence(content))), model: this.options.model };
  }
}

function stripJsonFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}
