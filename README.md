# Telegram Church Bot

MVP bot for a church community in Telegram: channel reminders, sermon audio processing, AI-assisted Bible Q&A, and reusable church communication workflows.

## Project Status

Current phase: sermon audio pipeline.

See [ROADMAP.md](ROADMAP.md) for the implementation path and [TASKS.md](TASKS.md) for the live checklist.

## MVP Scope

- Manage church events and recurring schedule.
- Send reminders before events.
- Accept sermon audio from the group.
- Transcribe sermon audio.
- Generate sermon summary, key thoughts, reflection questions, and follow-up posts.
- Answer Bible and church-related questions with a cautious AI assistant.
- Support admin-only commands for configuration and moderation.

## Documentation

- [PROJECT_VISION.md](PROJECT_VISION.md): product vision, users, principles, and MVP boundaries.
- [ROADMAP.md](ROADMAP.md): phased implementation plan.
- [TASKS.md](TASKS.md): current execution checklist for developers.
- [ARCHITECTURE.md](ARCHITECTURE.md): proposed technical architecture.
- [CONTRIBUTING.md](CONTRIBUTING.md): workflow for future contributors.
- [DECISIONS.md](DECISIONS.md): architecture decision log.
- [docs/TELEGRAM_API.md](docs/TELEGRAM_API.md): verified Telegram API behavior and setup.

## Local Development

Requirements: Node.js 20.19 or newer.

1. Install dependencies: `npm install`.
2. Create a local environment file: `cp .env.example .env`.
3. Start PostgreSQL: `docker compose up -d postgres`.
4. Apply database migrations: `npm run db:deploy`.
5. Add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and admin user IDs.
6. Start development mode: `npm run dev`.
7. Check the service at `http://localhost:3000/health`.

Telegram sends production updates to `POST /webhooks/telegram`. Set the complete public HTTPS endpoint in `TELEGRAM_WEBHOOK_URL`, then run `npm run telegram:setup`.

For local testing without a public HTTPS endpoint, set `TELEGRAM_UPDATE_MODE=polling`. The application removes any active webhook and polls Telegram while the local process is running. Production should keep `TELEGRAM_UPDATE_MODE=webhook`.

Useful checks: `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.

## Schedule Commands

- `/events` lists active events in the current group.
- `/event_add 2026-09-20 10:00 | Воскресное собрание | Дом молитвы | 1020` creates a one-time event and reminds 1,020 minutes before it.
- `/event_weekly 7 10:00 | Воскресное собрание | Дом молитвы | 1020` creates a weekly Sunday event.
- `/event_edit EVENT_ID 2026-09-27 11:00 | Особое собрание | Дом молитвы | 1440` edits a one-time event.
- `/event_edit EVENT_ID 7 11:00 | Воскресное собрание | Дом молитвы | 1020` edits a weekly event.
- `/event_delete EVENT_ID` disables an event.

Weekdays use ISO numbering: Monday is 1 and Sunday is 7. Administrative commands are restricted to IDs in `TELEGRAM_ADMIN_USER_IDS`. Use `/whoami` to obtain your ID.

## Reminder Worker

The reminder worker starts automatically when both `DATABASE_URL` and `TELEGRAM_BOT_TOKEN` are configured. It plans each occurrence in PostgreSQL, atomically claims due deliveries, and records successful or failed attempts. Failed sends retry with exponential backoff, up to five total attempts. `REMINDER_POLL_INTERVAL_MS` controls how often the worker checks the queue.

Run the PostgreSQL integration test with:

`DATABASE_URL=postgresql://postgres:postgres@localhost:5433/telegram_church_bot TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/telegram_church_bot npm test`

## Sermon Audio Intake

The bot accepts Telegram audio, voice messages, and documents with an `audio/*` MIME type. Channel posts are accepted automatically; uploads in groups and private chats require a user ID listed in `TELEGRAM_ADMIN_USER_IDS`. Metadata is stored idempotently in PostgreSQL, then a background worker downloads the file into `SERMON_STORAGE_DIR`.

The hosted Telegram Bot API allows bots to download files up to 20 MB. `SERMON_MAX_FILE_SIZE_BYTES` defaults to that limit, and oversized files are recorded without repeatedly attempting a download. Temporary failures retry with exponential backoff, up to five attempts.

## Sermon Transcription

When `OPENAI_API_KEY` is configured, a second background worker sends stored sermon audio to the OpenAI transcription API. The default model is `gpt-4o-mini-transcribe` with Russian language guidance. The full transcript, model name, processing status, attempt count, and errors are persisted in PostgreSQL. Configure the worker with `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_TRANSCRIPTION_LANGUAGE`, and `TRANSCRIPTION_POLL_INTERVAL_MS`.

After transcription, a content worker uses the OpenAI Responses API with a strict JSON schema to generate a summary, key thoughts, reflection questions, and follow-up post drafts. Responses are requested with `store: false`; generated drafts remain unpublished until administrator approval is implemented and granted.
