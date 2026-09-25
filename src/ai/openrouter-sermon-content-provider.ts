import { z } from 'zod';
import type { SermonContentProvider } from './sermon-content-provider.js';
import { OpenRouterClient } from './openrouter-client.js';

const stringArray = z.preprocess((value) => typeof value === 'string' ? [value] : value, z.array(z.string().min(1)));
const schema = z.object({
  summary: z.string().min(1).max(4_000),
  outline: z.array(z.object({ title: z.string().min(1), points: stringArray })).default([]),
  keyThoughts: stringArray.pipe(z.array(z.string().min(1).max(1_000)).min(3).max(7)),
  reflectionQuestions: stringArray.pipe(z.array(z.string().min(1).max(1_000)).min(2).max(5)),
  followUpPosts: z.array(z.object({ thought: z.string().min(120).max(750), practice: z.string().min(80).max(500), imagePrompt: z.string().min(30).max(500) })).length(6).optional(),
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
    const instructions = 'Ты опытный редактор церковной группы. Работай только с данным транскриптом, пиши естественно по-русски и не придумывай цитаты, ссылки или факты. Верни только JSON: summary, outline, keyThoughts, reflectionQuestions, followUpPosts. outline — массив объектов {title, points}. keyThoughts — 3–7 элементов. reflectionQuestions — 2–5 элементов. В followUpPosts ровно 6 объектов. thought — законченный самостоятельный абзац 2–4 предложения (120–750 знаков): ясный тезис, его смысл и связь с конкретной мыслью проповеди; не заголовок и не обрывок. practice — конкретное выполнимое действие или глубокий вопрос на сегодня, 80–500 знаков, без общих фраз. imagePrompt — выразительная фотореалистичная или художественная сцена по теме поста, без букв, надписей, логотипов и изображений текста, 30–500 знаков.';
    const raw = await this.client.chat(this.options.model, [
      { role: 'system', content: instructions },
      { role: 'user', content: context },
    ], responseFormat);
    let parsed = schema.safeParse(parseJson(raw));
    if (!parsed.success) {
      const repaired = await this.client.chat(this.options.model, [
        { role: 'system', content: `${instructions} Исправь переданный черновик. Строго соблюдай типы, количество элементов и минимальную длину thought/practice. Верни только исправленный JSON.` },
        { role: 'user', content: raw },
      ], responseFormat);
      parsed = schema.safeParse(parseJson(repaired));
    }
    if (!parsed.success) throw parsed.error;
    const posts = parsed.data.followUpPosts ?? Array.from({ length: 6 }, (_, index) => ({ thought: parsed.data.keyThoughts[index % parsed.data.keyThoughts.length]!, practice: parsed.data.reflectionQuestions[index % parsed.data.reflectionQuestions.length]!, imagePrompt: 'Спокойная тематическая иллюстрация о вере, без текста' }));
    return { ...parsed.data, followUpPosts: posts.map((post) => `<b>Мысль из проповеди</b>\n\n${post.thought}\n\n<b>Практика на сегодня</b>\n${post.practice}\n\nИзображение: ${post.imagePrompt}`), model: this.options.model };
  }
}

function parseJson(raw: string): unknown { return JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '').trim()); }
