export interface AssistantRepository {
  getContext(chatId: string): Promise<string | undefined>;
  setContext(chatId: string, context: string, timezone: string): Promise<void>;
  log(input: { chatId: string; userHash: string; outcome: 'answered' | 'escalated' | 'failed'; category: string; model?: string; timezone: string }): Promise<void>;
}
