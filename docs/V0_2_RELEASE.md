# Version 0.2 Release Audit

Release date: 2026-09-14

## Delivered

- Interactive administrator dashboard and persistent guided event flow.
- Durable private sermon processing notifications.
- Audited sermon draft editing, rejection, regeneration, and approval.
- Moderated weekly digest generation and retryable delivery.
- Event RSVP with one response per member and aggregate-only reporting.
- Group-scoped sermon transcript search with deterministic source excerpts.

## Verification

- All migrations applied from an empty PostgreSQL database.
- 84 automated tests passed, including transport and database integration tests.
- TypeScript typecheck, ESLint, production build, and dependency audit passed.
- Docker image `telegram-church-bot:0.2.0` built and returned ready against PostgreSQL.
- Telegram command menu updated on `@pastorHelperBot` in polling mode.
- Tracked files scanned for known Telegram, Gemini, and Groq key patterns; none found.

## Operator Notes

- AI-generated sermon posts and weekly digests require administrator approval.
- The submitting administrator receives sermon progress privately.
- Complete `docs/PILOT_CHECKLIST.md` before rollout to the real church group.
