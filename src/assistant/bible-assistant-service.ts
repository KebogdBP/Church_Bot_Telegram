import { createHmac } from 'node:crypto';
import type { AssistantRepository } from './assistant-repository.js';
import type { BibleAnswerProvider } from './bible-answer-provider.js';
import type { SermonSearchResult } from '../sermons/sermon-search-service.js';

const URGENT = /самоубий|суицид|убить себя|не хочу жить|насили|избива|угрожа/i;
const PROFESSIONAL = /диагноз|лекарств|лечение|юрист|законн|инвестиц|долг/i;

export interface SermonArchiveRetriever { searchContext(chatId: string, question: string, limit?: number): Promise<SermonSearchResult[]> }

export class BibleAssistantService {
  public constructor(private readonly repository: AssistantRepository, private readonly provider: BibleAnswerProvider, private readonly privacySecret: string, private readonly timezone: string, private readonly archive?: SermonArchiveRetriever) {}
  public ask(chatId: string, userId: string, question: string) { return this.answer(chatId, userId, question, false); }
  public askWithSermons(chatId: string, userId: string, question: string) { return this.answer(chatId, userId, question, true); }

  private async answer(chatId: string, userId: string, question: string, withSermons: boolean) {
    const userHash = createHmac('sha256', this.privacySecret).update(userId).digest('hex');
    if (URGENT.test(question)) {
      await this.repository.log({ chatId, userHash, outcome: 'escalated', category: 'urgent_safety', timezone: this.timezone });
      return { text: 'Мне очень жаль, что вы столкнулись с этим. Бот не может безопасно помочь в экстренной ситуации. Если есть непосредственная опасность, обратитесь в местную экстренную службу прямо сейчас. Также немедленно свяжитесь с пастором или человеком, которому доверяете, и не оставайтесь в одиночестве.', escalated: true };
    }
    if (PROFESSIONAL.test(question)) {
      await this.repository.log({ chatId, userHash, outcome: 'escalated', category: 'professional_help', timezone: this.timezone });
      return { text: 'Этот вопрос требует помощи профильного специалиста. Я могу помочь найти библейские принципы для размышления, но не заменяю врача, юриста или финансового консультанта. Обсудите ситуацию со специалистом и пастором.', escalated: true };
    }
    try {
      const sermonContext = withSermons && this.archive ? await this.archive.searchContext(chatId, question, 3) : [];
      const result = await this.provider.answer(question, await this.repository.getContext(chatId), sermonContext.map((item) => ({ sermonId: item.sermonId, title: item.title, excerpt: item.excerpt })));
      await this.repository.log({ chatId, userHash, outcome: 'answered', category: result.category, model: result.model, timezone: this.timezone });
      const references = result.bibleReferences.length ? `\n\nБиблейские места: ${result.bibleReferences.join('; ')}` : '';
      const pastor = result.needsPastor ? '\n\nЭтот вопрос лучше также обсудить с пастором.' : '';
      const allowedSources = new Set(sermonContext.map((item) => item.sermonId));
      const citedSources = result.sermonSourceIds.filter((id) => allowedSources.has(id));
      const sources = citedSources.length ? `\n\nИсточники архива: ${citedSources.map((id) => `[${id}]`).join(', ')}` : withSermons ? '\n\nПодходящих материалов в архиве не использовано.' : '';
      return { text: `${result.answer}${references}${sources}${pastor}`, escalated: result.needsPastor };
    } catch (error) {
      await this.repository.log({ chatId, userHash, outcome: 'failed', category: 'provider_error', timezone: this.timezone });
      throw error;
    }
  }
  public setContext(chatId: string, context: string) { return this.repository.setContext(chatId, context, this.timezone); }
}
