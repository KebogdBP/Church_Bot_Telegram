# Technical Review - 2026-09-15

## Scope

The review covered application boundaries, external HTTP clients, AI fallback behavior, durable workers, retention, Telegram HTML output, database integration tests, build checks, and dependency health.

## Corrected

- Added explicit request deadlines for Telegram, Gemini, Groq text, and Groq transcription calls.
- Added privacy-safe error logs for AI fallback, private AI answers, commands, and callback actions.
- Changed retention eligibility from sermon receipt time to actual audio storage and transcription completion time.
- Added a durable retry queue so a filesystem error cannot silently orphan an undeleted audio file.
- Added exponential retry delay, stale-claim diagnostics, and error clearing to prayer publication jobs.
- Centralized HTML escaping and made bounded output preserve complete HTML entities.
- Guarded destructive integration-test setup with a dedicated test-database name check.
- Scoped linting to this project so unrelated sibling workspaces do not affect its checks.

## Verification

- TypeScript typecheck: passed.
- Unit and transport tests: 101 passed.
- PostgreSQL integration tests: all 13 passed against a temporary dedicated Raspberry Pi database, which was removed after the run.
- ESLint: passed.
- Production build: passed.
- High-severity dependency audit: zero vulnerabilities.

## Deferred Debt

- `CommandRouter` and application composition are large and should be split by feature after the v0.3 release. Doing that during the release audit would create broad regression risk without changing behavior.
- Domain mutations and audit writes are not atomic; repositories need a transaction-aware audit interface.
- Public linked-audio download needs address pinning or an egress proxy that enforces destination policy to close the DNS-rebinding window.
- Readiness currently proves database availability, not Telegram and AI-provider availability.
- Delivery remains at-least-once and may duplicate a message if the process stops immediately after Telegram accepts it.

## Deployment Verification

Commit `52f4769` was deployed to the Raspberry Pi after a database backup. Both September 15 migrations applied successfully, all containers became healthy, Telegram polling started through the isolated Xray sidecar, and a real Groq JSON request through the same route succeeded. Manual Telegram checks of private chat, audio transcription, and `/retention_dry_run` remain useful release acceptance checks.
