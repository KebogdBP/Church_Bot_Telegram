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
- Physical audio deletion is tracked durably and retried after filesystem failures; database references are cleared transactionally only after a deletion job is recorded.
- Database integration tests refuse database names that do not visibly contain `test` before issuing cleanup statements.
- The Raspberry Pi deployment routes only bot HTTP clients through an internal Xray sidecar; its proxy port is not published to the LAN or Internet.

## Residual Risks

- Telegram delivery is at-least-once; a crash after a successful send can produce a duplicate.
- Audit records are currently written after domain mutations rather than in the same database transaction. A temporary audit failure can therefore leave a completed action without its audit entry.
- Public audio-link validation resolves and checks DNS before download but does not pin the validated address for the subsequent request. Restrict `/sermon_link` to trusted administrators until DNS rebinding protection is implemented end to end.
- Readiness verifies PostgreSQL but does not actively probe Telegram or AI providers. Use `/status` and structured provider-fallback logs for diagnosis.
- Local disk audio requires encrypted host backups; configured retention reduces exposure but does not securely erase backup copies.
- Group administrators must periodically review role membership and generated drafts.
- A production host still needs TLS, firewalling, patching, log retention, and uptime alerts.

Rotate a leaked Telegram, Gemini, Groq, or database secret immediately. Revoke the bot token through BotFather when applicable.
