# Security Review

## Controls

- Webhooks require Telegram's secret-token header; production configuration refuses missing secrets.
- Administrative actions require a bootstrap or group-scoped Telegram user ID.
- Secrets stay in ignored environment files and are never written to logs.
- AI interaction logs contain a keyed user hash and metadata, not questions or answers.
- Urgent safety categories are handled before an AI request and direct people to human help.
- Telegram/AI calls and durable jobs have bounded retries; stale claims are recovered.
- Audio size is limited and generated text is escaped before Telegram HTML rendering.
- The container runs as a non-root user and readiness checks include PostgreSQL.

## Residual Risks

- Telegram delivery is at-least-once; a crash after a successful send can produce a duplicate.
- Local disk audio requires encrypted host backups and retention rules.
- Group administrators must periodically review role membership and generated drafts.
- A production host still needs TLS, firewalling, patching, log retention, and uptime alerts.

Rotate a leaked Telegram/OpenAI/database secret immediately. Revoke the bot token through BotFather when applicable.
