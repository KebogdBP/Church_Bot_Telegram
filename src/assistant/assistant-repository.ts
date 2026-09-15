import type { ConversationTurn } from './bible-answer-provider.js';

export interface AssistantRepository {
  getContext(chatId: string): Promise<string | undefined>;
  setContext(chatId: string, context: string, timezone: string): Promise<void>;
  log(input: { chatId: string; userHash: string; outcome: 'answered' | 'escalated' | 'failed'; category: string; model?: string; timezone: string }): Promise<void>;
  getHistory(chatId: string, userHash: string, limit: number): Promise<ConversationTurn[]>;
  appendExchange(chatId: string, userHash: string, question: string, answer: string, timezone: string): Promise<void>;
  clearHistory(chatId: string, userHash: string): Promise<void>;
}
