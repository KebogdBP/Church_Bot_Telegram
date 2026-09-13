# Live Project Checklist

This file is the shared handoff point for all developers. Update it whenever work starts, pauses, or completes.

## Current Status

Phase: 3 - Sermon Audio Pipeline

Current focus: integrate transcription for stored sermon audio.

## Active Tasks

- [ ] Create a bot with Telegram BotFather and obtain its token.
- [ ] Choose a deployment target with HTTPS on port 443.
- [ ] Register the Telegram webhook.
- [ ] Add the bot to a Telegram test channel and discussion group.
- [ ] Verify `/whoami`, `/help`, and admin-only `/status` end to end.
- [ ] Choose and integrate the sermon transcription provider.
- [ ] Save sermon transcripts in PostgreSQL.

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

Last tested commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run db:deploy`.

Implementation note: Telegram delivery uses webhook at `POST /webhooks/telegram`; requests are checked against `X-Telegram-Bot-Api-Secret-Token` when `TELEGRAM_WEBHOOK_SECRET` is configured.

Worker note: reminder and sermon-download workers run only when both `DATABASE_URL` and `TELEGRAM_BOT_TOKEN` are configured. Their polling intervals are configured separately, and sermon files are stored under `SERMON_STORAGE_DIR`.

Event editing note: `/event_edit ID YYYY-MM-DD HH:MM | Title | Location | ReminderMinutes` edits one-time events. For weekly events, replace the date with an ISO weekday from 1 to 7.
