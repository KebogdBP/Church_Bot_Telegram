import { createHmac } from 'node:crypto';
import type { AssistantRepository } from './assistant-repository.js';
import type { BibleAnswerProvider } from './bible-answer-provider.js';

const URGENT = /самоубий|суицид|убить себя|не хочу жить|насили|избива|угрожа/i;
const PROFESSIONAL = /диагноз|лекарств|лечение|юрист|законн|инвестиц|долг/i;

export class BibleAssistantService {
  public constructor(private readonly repository: AssistantRepository, private readonly provider: BibleAnswerProvider, private readonly privacySecret: string, private readonly timezone: string) {}
  public async ask(chatId: string, userId: string, question: string) {
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
      const result = await this.provider.answer(question, await this.repository.getContext(chatId));
      await this.repository.log({ chatId, userHash, outcome: 'answered', category: result.category, model: result.model, timezone: this.timezone });
      const references = result.bibleReferences.length ? `\n\nБиблейские места: ${result.bibleReferences.join('; ')}` : '';
      const pastor = result.needsPastor ? '\n\nЭтот вопрос лучше также обсудить с пастором.' : '';
      return { text: `${result.answer}${references}${pastor}`, escalated: result.needsPastor };
    } catch (error) {
      await this.repository.log({ chatId, userHash, outcome: 'failed', category: 'provider_error', timezone: this.timezone });
      throw error;
    }
  }
  public setContext(chatId: string, context: string) { return this.repository.setContext(chatId, context, this.timezone); }
}
