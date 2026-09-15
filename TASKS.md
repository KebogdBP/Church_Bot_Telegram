# Live Project Checklist

This file is the shared handoff point for all developers. Update it whenever work starts, pauses, or completes.

## Current Status

Phase: Version 0.3 - Release Audit

Current focus: production regression, privacy review, operator documentation, deployment verification, and the v0.3 release.

## Active Tasks

- [x] Create a bot with Telegram BotFather and obtain its token.
- [ ] Choose a deployment target with HTTPS on port 443.
- [ ] Register the Telegram webhook.
- [ ] Add the bot to a Telegram test channel and discussion group.
- [x] Verify private bot messaging end to end through local polling.
- [ ] Verify the bot in a Telegram test channel and discussion group.
- [ ] Add production deployment and backup configuration.
- [ ] Add readiness monitoring and complete the security review.
- [x] Verify the isolated Xray route to `api.telegram.org` and complete the Raspberry Pi bot rollout.
- [x] Add group retention settings for audio, transcripts, and private prayer requests.
- [x] Add an administrator-only retention dry run.
- [x] Add retry-safe, audited deletion with explicit confirmation.
- [x] Complete the v0.3 code, security, timeout, and test-safety review.
- [x] Add bounded encrypted AI conversation memory and user-controlled deletion.
- [x] Run the full PostgreSQL integration suite and deploy the review migrations to Raspberry Pi.

## Done

- [x] Draft project vision.
- [x] Draft implementation roadmap.
- [x] Draft architecture outline.
- [x] Draft contribution workflow.
- [x] Draft decision log.
- [x] Create private GitHub repository.
- [x] Choose TypeScript, Node.js, and Fastify.
- [x] Add application skeleton and local run command.
- [x] Add typed configuration and `.env.example`.
- [x] Add health endpoint and structured logging.
- [x] Add Telegram webhook validation and update normalization.
- [x] Add Telegram message sender and command router.
- [x] Add initial admin authorization.
- [x] Add automated tests for the foundation.
- [x] Record verified Telegram API constraints and source links.
- [x] Add PostgreSQL and Prisma event schema with an initial migration.
- [x] Add one-time and weekly event creation.
- [x] Add `/events`, `/event_add`, `/event_weekly`, and `/event_delete`.
- [x] Add timezone-aware reminder calculation.
- [x] Verify the migration against PostgreSQL 17 in Docker.
- [x] Add durable reminder planning and delivery worker.
- [x] Prevent duplicate delivery with a database uniqueness constraint.
- [x] Add bounded retries with exponential backoff and stale-job recovery.
- [x] Add warm, timezone-aware reminder messages.
- [x] Test the reminder repository against a real PostgreSQL database.
- [x] Add `/event_edit` for one-time and weekly events.
- [x] Re-plan pending reminders transactionally after an event edit.
- [x] Accept Telegram audio, voice messages, and audio documents as sermons.
- [x] Persist sermon metadata idempotently in PostgreSQL.
- [x] Download accepted sermon audio to local storage with bounded retries.
- [x] Enforce the hosted Telegram Bot API 20 MB download limit.
- [x] Integrate OpenAI audio transcription with Russian language guidance.
- [x] Persist transcripts, model metadata, attempts, and errors in PostgreSQL.
- [x] Add bounded transcription retries and stale-job recovery.
- [x] Add a local Telegram polling mode that does not require public HTTPS.
- [x] Connect `@pastorHelperBot` and configure the first administrator.
- [x] Generate structured summaries, key thoughts, reflection questions, and post drafts.
- [x] Persist generated sermon materials and retry state in PostgreSQL.
- [x] Materialize AI follow-up drafts as separately reviewable posts.
- [x] Add `/sermons`, `/sermon_review`, and `/sermon_approve`.
- [x] Schedule approved series and deliver them with bounded retries.
- [x] Add `/ask` with strict structured AI responses and Bible references.
- [x] Add deterministic crisis and professional-advice escalation.
- [x] Add admin-configurable church context with `/context_set`.
- [x] Log only privacy-preserving interaction metadata.
- [x] Choose command-first administration for the MVP.
- [x] Add persistent group roles with `/admin_add` and `/admin_remove`.
- [x] Add `/settings` and an operational `/status` dashboard.
- [x] Add a durable, group-scoped administrator audit log.
- [x] Record event, sermon moderation, digest, announcement, role, and prayer-request mutations without sensitive text.
- [x] Add administrator-only `/activity` with the latest 20 actions and a failed-job summary.
- [x] Verify the audit migration against PostgreSQL 17.
- [x] Add `/retention`, `/retention_set`, `/retention_dry_run`, and `/retention_run CONFIRM`.
- [x] Preserve active prayer publications during retention cleanup.
- [x] Verify retention against PostgreSQL 17 and local filesystem deletion; verify a repeated run removes zero records.

## Decisions Needed

- Hosting target.
- Confirm production PostgreSQL and Redis hosting approach.
- Confirm OpenAI as transcription and text generation provider before Phase 3.
- Whether admin UX starts as commands only or includes a web panel.

## Recommended MVP Stack

- Backend: TypeScript with Node.js.
- Bot runtime: Telegram webhook for production.
- Database: PostgreSQL.
- ORM: Prisma.
- Job queue: BullMQ with Redis, or a simpler scheduler first if deployment constraints require it.
- AI: OpenAI API for transcription and text generation.
- Admin UI: start with bot commands, add web panel after core flows work.

## Handoff Notes

When handing off work, update:

- current phase;
- active task;
- completed tasks;
- known blockers;
- last tested command;
- important implementation notes.

Last tested commands (2026-09-15): `npm test` (101 unit and transport tests passed), the 13-test PostgreSQL integration suite against a dedicated server database, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm audit --audit-level=high`.

Deployment note: commit `52f4769` is deployed at `/home/kebogd/apps/telegram-church-bot`. Both September 15 migrations are applied. The app, PostgreSQL, and isolated Xray sidecar are healthy; Telegram polling and a real Groq health request were verified through the sidecar while no proxy port is published. Docker autostart is enabled.

Implementation note: Telegram delivery uses webhook at `POST /webhooks/telegram`; requests are checked against `X-Telegram-Bot-Api-Secret-Token` when `TELEGRAM_WEBHOOK_SECRET` is configured.

Worker note: reminder and sermon-download workers run only when both `DATABASE_URL` and `TELEGRAM_BOT_TOKEN` are configured. Their polling intervals are configured separately, and sermon files are stored under `SERMON_STORAGE_DIR`.

Transcription note: the transcription worker runs when `DATABASE_URL` and `OPENAI_API_KEY` are configured. It processes stored audio with `OPENAI_TRANSCRIPTION_MODEL` and persists the full transcript before later content-generation steps.

Event editing note: `/event_edit ID YYYY-MM-DD HH:MM | Title | Location | ReminderMinutes` edits one-time events. For weekly events, replace the date with an ISO weekday from 1 to 7.
