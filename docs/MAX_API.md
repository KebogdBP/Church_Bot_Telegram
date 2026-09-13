# MAX Bot API Notes

Last reviewed: 2026-09-13.

Official sources:

- [API overview](https://dev.max.ru/docs-api)
- [Webhook subscription](https://dev.max.ru/docs-api/methods/POST/subscriptions)
- [Send a message](https://dev.max.ru/docs-api/methods/POST/messages)
- [Update object](https://dev.max.ru/docs-api/objects/Update)

## Decisions For This Project

- Use `https://platform-api2.max.ru` as the API base URL.
- Use webhook delivery in production. Long polling is intended only for development and testing.
- Receive events at `POST /webhooks/max`.
- Configure the subscription with `message_created`, `bot_started`, `bot_added`, and the events needed by later features.
- Set a webhook secret and validate `X-Max-Bot-Api-Secret` on every request.
- Send the bot token in the `Authorization` header, never in query parameters.
- Persist chat IDs received in updates; the API no longer provides a reliable general chat-list endpoint.

## Operational Constraints

- The production webhook must be reachable through HTTPS on port 443.
- Self-signed TLS certificates are not supported.
- The webhook must return HTTP 200 within 30 seconds.
- MAX retries failed webhook delivery, but may remove the subscription after prolonged failure.
- Keep total API traffic at or below 30 requests per second.
- Send no more than two messages per second to one chat.
- Message text is limited to 4,000 characters.

## Known Integration Risks

- MAX payloads can evolve. Validation deliberately accepts unknown fields while checking the fields used by the bot.
- Some message events may not contain text or a complete message object. Such events are acknowledged and ignored until their attachment-specific handler exists.
- Outbound retries, per-chat rate limiting, and durable webhook processing are required before production launch.
