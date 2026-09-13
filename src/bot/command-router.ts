import type { MaxMessageSender } from '../max/max-api-client.js';
import type { IncomingMessage } from '../max/types.js';

export interface CommandRouterOptions {
  sender: MaxMessageSender;
  adminUserIds: ReadonlySet<string>;
}

const HELP_TEXT = [
  '**Помощник церковной группы**',
  '',
  '/help - показать доступные команды',
  '/status - проверить состояние бота (для администраторов)',
].join('\n');

export class CommandRouter {
  public constructor(private readonly options: CommandRouterOptions) {}

  public async handle(message: IncomingMessage): Promise<void> {
    const command = message.text.split(/\s+/, 1)[0]?.toLowerCase().split('@', 1)[0];

    if (command === '/start' || command === '/help') {
      await this.reply(message.chatId, HELP_TEXT);
      return;
    }

    if (command === '/status') {
      if (!this.options.adminUserIds.has(message.userId)) {
        await this.reply(message.chatId, 'Эта команда доступна только администраторам.');
        return;
      }

      await this.reply(message.chatId, 'Бот работает. Подключение к MAX активно.');
    }
  }

  private async reply(chatId: string, text: string): Promise<void> {
    await this.options.sender.sendMessage({ chatId, text });
  }
}
