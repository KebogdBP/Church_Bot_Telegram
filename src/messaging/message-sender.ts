export interface SendMessageInput {
  chatId: string;
  text: string;
  notify?: boolean;
  keyboard?: InlineButton[][];
}

export interface InlineButton { text: string; callbackData: string }

export interface MessageSender {
  sendMessage(input: SendMessageInput): Promise<void>;
  answerCallback?(callbackId: string, text?: string): Promise<void>;
}
