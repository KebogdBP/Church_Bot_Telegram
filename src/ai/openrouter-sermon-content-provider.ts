import { z } from 'zod';
import type { SermonContentProvider } from './sermon-content-provider.js';
import { OpenRouterClient } from './openrouter-client.js';

const stringArray = z.preprocess((value) => typeof value === 'string' ? [value] : value, z.array(z.string().min(1)));
const schema = z.object({
  summary: z.string().min(1).max(4_000),
  outline: z.array(z.object({ title: z.string().min(1), points: stringArray })).default([]),
  keyThoughts: stringArray.pipe(z.array(z.string().min(1).max(1_000)).min(3).max(7)),
  reflectionQuestions: stringArray.pipe(z.array(z.string().min(1).max(1_000)).min(2).max(5)),
  followUpPosts: z.array(z.object({ thought: z.string().min(1), practice: z.string().min(1), imagePrompt: z.string().min(1) })).length(6).optional(),
});

const MAX_ANALYSIS_CHARS = 18_000;
const responseFormat = { type: 'json_object' };

export class OpenRouterSermonContentProvider implements SermonContentProvider {
  private readonly client: OpenRouterClient;
  public constructor(private readonly options: { apiKey?: string; baseUrl: string; proxyUrl?: string; model: string }) {
    this.client = new OpenRouterClient(options);
  }

  public async generate(transcript: string) {
    const context = transcript.length <= MAX_ANALYSIS_CHARS ? transcript : `${transcript.slice(0, 9_000)}\n\n[середина сокращена]\n\n${transcript.slice(-9_000)}`;
    const raw = await this.client.chat(this.options.model, [
      { role: 'system', content: 'Ты редактор церковной группы. Работай только с данным транскриптом. Пиши по-русски. Не придумывай цитаты, библейские ссылки и факты. Верни только JSON с полями summary, outline, keyThoughts, reflectionQuestions, followUpPosts. В followUpPosts ровно 6 объектов thought, practice, imagePrompt.' },
      { role: 'user', content: context },
    ], responseFormat);
    const parsed = schema.parse(JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '').trim()));
    const posts = parsed.followUpPosts ?? Array.from({ length: 6 }, (_, index) => ({ thought: parsed.keyThoughts[index % parsed.keyThoughts.length]!, practice: parsed.reflectionQuestions[index % parsed.reflectionQuestions.length]!, imagePrompt: 'Спокойная тематическая иллюстрация о вере, без текста' }));
    return { ...parsed, followUpPosts: posts.map((post) => `💡 ${post.thought}\n\nПрактика: ${post.practice}\n\nИзображение: ${post.imagePrompt}`), model: this.options.model };
  }
}
