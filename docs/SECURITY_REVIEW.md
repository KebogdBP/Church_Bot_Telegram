# Security Review

## Controls

- Webhooks require Telegram's secret-token header; production configuration refuses missing secrets.
- Administrative actions require a bootstrap or group-scoped Telegram user ID.
- Secrets stay in ignored environment files and are never written to logs.
- AI interaction logs contain a keyed user hash and metadata, not questions or answers.
- Urgent safety categories are handled before an AI request and direct people to human help.
- Telegram, Gemini, and Groq calls and durable jobs have bounded retries; stale claims are recovered.
- Audio size is limited and generated text is escaped before Telegram HTML rendering.
- Linked audio requires HTTPS, refuses credentials, limits redirects, resolves DNS before every request, and blocks private/reserved networks.
- The container runs as a non-root user and readiness checks include PostgreSQL.
- RSVP callbacks validate the event against the current chat and expose aggregate counts only.
- Digest and sermon AI content cannot enter a delivery queue without an authenticated administrator approval.
- Archive search is group-scoped and returns bounded stored excerpts rather than AI-generated citations.
- Retention values are group-scoped and constrained to 1–3650 days in both application validation and PostgreSQL.
- Destructive cleanup requires an exact administrator confirmation, excludes in-flight prayer publications, and writes only aggregate counts to the audit log.

## Residual Risks

- Telegram delivery is at-least-once; a crash after a successful send can produce a duplicate.
- Local disk audio requires encrypted host backups; configured retention reduces exposure but does not securely erase backup copies.
- Group administrators must periodically review role membership and generated drafts.
- A production host still needs TLS, firewalling, patching, log retention, and uptime alerts.

Rotate a leaked Telegram, Gemini, Groq, or database secret immediately. Revoke the bot token through BotFather when applicable.
