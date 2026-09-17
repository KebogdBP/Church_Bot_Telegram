export interface SendMessageInput {
  chatId: string;
  text: string;
  notify?: boolean;
  keyboard?: InlineButton[][];
}

export interface SendFileInput {
  chatId: string;
  fileName: string;
  bytes: Uint8Array;
  caption?: string;
}

export interface InlineButton { text: string; callbackData: string }

export interface MessageSender {
  sendMessage(input: SendMessageInput): Promise<void>;
  sendAudio?(input: SendFileInput): Promise<void>;
  sendDocument?(input: SendFileInput): Promise<void>;
  answerCallback?(callbackId: string, text?: string): Promise<void>;
}
