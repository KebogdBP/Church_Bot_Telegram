# Telegram Bot API Notes

Last reviewed: 2026-09-13.

Official sources:

- [Bot platform overview](https://core.telegram.org/bots)
- [Bot features and BotFather](https://core.telegram.org/bots/features)
- [Bot API reference](https://core.telegram.org/bots/api)
- [Webhook guide](https://core.telegram.org/bots/webhooks)

## Decisions For This Project

- Use `https://api.telegram.org` as the Bot API base URL.
- Receive production updates at `POST /webhooks/telegram`.
- Register the webhook with `message` and `channel_post` updates.
- Set `secret_token` and validate `X-Telegram-Bot-Api-Secret-Token` on every webhook request.
- Use a channel for announcements and reminders.
- Use a linked discussion group or private bot chat for member questions and administrative commands.
- Store chat and user IDs as strings because group and channel IDs are signed 64-bit integers.
- Resolve accepted audio through `getFile` and persist the original message metadata before downloading.
- Keep the hosted Bot API's 20 MB download ceiling as the default sermon file limit.

## Telegram Setup

1. Create the bot with `@BotFather` using `/newbot`.
2. Put the token and a generated webhook secret in `.env`.
3. Deploy the service or expose it through a trusted HTTPS URL.
4. Set `TELEGRAM_WEBHOOK_URL` to the complete endpoint ending in `/webhooks/telegram`.
5. Run `npm run telegram:setup`.
6. Add the bot to the church channel as an administrator with permission to post messages.
7. Add it to the discussion group. Keep Privacy Mode enabled if the bot only needs commands; disable it only when sermon intake or free-text AI questions require all messages.
8. Send `/whoami` to obtain an administrator user ID and add it to `TELEGRAM_ADMIN_USER_IDS`.

## Operational Notes

- Telegram's hosted Bot API requires an HTTPS webhook and supports ports 443, 80, 88, and 8443.
- `getUpdates` and webhook delivery cannot be active at the same time.
- Telegram retries webhook requests that do not return a successful HTTP status.
- Bots cannot initiate private conversations; a user must start the bot first.
- Channel subscribers cannot send ordinary messages into the channel. Interactive Q&A belongs in the linked discussion group or a private bot chat.
- Bots receive all channel posts where they are members. In groups, Privacy Mode limits which messages they receive unless they are administrators or privacy is disabled.
- Hosted Bot API file downloads use `/file/bot<token>/<file_path>` and are limited to 20 MB. The returned URL remains valid for at least one hour.
- `getFile` may not preserve the original filename or MIME type, so those values are captured from the incoming message.
- A self-hosted local Bot API server can be evaluated later if full-length sermons regularly exceed 20 MB.
