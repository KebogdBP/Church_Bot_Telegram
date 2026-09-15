import type { BibleAnswerProvider } from '../assistant/bible-answer-provider.js';
import type { SermonContentProvider } from './sermon-content-provider.js';

export class FallbackBibleAnswerProvider implements BibleAnswerProvider {
  public constructor(private readonly primary: BibleAnswerProvider, private readonly fallback: BibleAnswerProvider, private readonly onFallback?: (error: unknown) => void) {}
  public async answer(...args: Parameters<BibleAnswerProvider['answer']>) {
    try { return await this.primary.answer(...args); } catch (error) { this.onFallback?.(error); return this.fallback.answer(...args); }
  }
}

export class FallbackSermonContentProvider implements SermonContentProvider {
  public constructor(private readonly primary: SermonContentProvider, private readonly fallback: SermonContentProvider, private readonly onFallback?: (error: unknown) => void) {}
  public async generate(transcript: string) {
    try { return await this.primary.generate(transcript); } catch (error) { this.onFallback?.(error); return this.fallback.generate(transcript); }
  }
}
