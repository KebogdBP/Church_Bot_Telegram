export interface SendMessageInput {
  chatId: string;
  text: string;
  notify?: boolean;
}

export interface MessageSender {
  sendMessage(input: SendMessageInput): Promise<void>;
}
