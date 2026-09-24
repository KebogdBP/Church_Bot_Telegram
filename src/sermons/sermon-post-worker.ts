import type { FastifyBaseLogger } from 'fastify';
import type { MessageSender } from '../messaging/message-sender.js';
import { escapeHtml } from '../messaging/html.js';
import type { SermonPostRepository } from './sermon-post.js';
import type { OpenRouterImageProvider } from '../ai/openrouter-image-provider.js';

export class SermonPostWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  public constructor(private readonly options: { repository: SermonPostRepository; sender: MessageSender; imageProvider?: OpenRouterImageProvider; logger: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>; intervalMs: number; now?: () => Date }) {}
  public start(): void { if (this.timer) return; void this.tick(); this.timer = setInterval(() => void this.tick(), this.options.intervalMs); this.timer.unref(); }
  public stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
  public async tick(): Promise<void> {
    if (this.running) return; this.running = true;
    const now = this.options.now?.() ?? new Date();
    try {
      const recovered = await this.options.repository.recoverStale(now, new Date(now.getTime() - 10 * 60_000));
      if (recovered) this.options.logger.warn({ recovered }, 'Recovered stale sermon posts');
      for (const post of await this.options.repository.claimDue(now, 20)) {
        try {
          const formatted = parseGeneratedPost(post.content);
          if (formatted.imagePrompt && this.options.imageProvider && this.options.sender.sendPhoto) {
            const image = await this.options.imageProvider.generate(formatted.imagePrompt);
            const caption = preserveSafeFormatting(formatted.caption);
            const photo = { chatId: post.chatId, fileName: `sermon-${post.id}.${image.mimeType.includes('png') ? 'png' : 'jpg'}`, bytes: image.bytes };
            if (caption.length <= 1_000) await this.options.sender.sendPhoto({ ...photo, caption });
            else { await this.options.sender.sendPhoto(photo); await this.options.sender.sendMessage({ chatId: post.chatId, text: caption }); }
          } else {
            await this.options.sender.sendMessage({ chatId: post.chatId, text: preserveSafeFormatting(formatted.caption) });
          }
          await this.options.repository.markSent(post.id, now);
          this.options.logger.info({ postId: post.id }, 'Sermon follow-up post sent');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const delay = Math.min(2 ** Math.max(0, post.attempt - 1) * 60_000, 60 * 60_000);
          await this.options.repository.markFailed(post.id, message, new Date(now.getTime() + delay));
          this.options.logger.error({ postId: post.id, error: message }, 'Sermon post delivery failed');
        }
      }
    } catch (error) { this.options.logger.error({ error }, 'Sermon post worker tick failed'); }
    finally { this.running = false; }
  }
}

export function parseGeneratedPost(content: string): { caption: string; imagePrompt?: string } {
  const match = /\n\nИзображение:\s*([\s\S]+)$/i.exec(content.trim());
  return match?.[1] ? { caption: content.slice(0, match.index).trim(), imagePrompt: match[1].trim() } : { caption: content.trim() };
}

function preserveSafeFormatting(content: string): string {
  return escapeHtml(content).replaceAll('&lt;b&gt;', '<b>').replaceAll('&lt;/b&gt;', '</b>');
}
