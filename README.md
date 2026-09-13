# MAX Church Bot

MVP bot for a church group in MAX: event reminders, sermon audio processing, AI-assisted Bible Q&A, and reusable church communication workflows.

## Project Status

Current phase: bot foundation.

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
- [docs/MAX_API.md](docs/MAX_API.md): verified MAX API behavior and constraints.

## Local Development

Requirements: Node.js 20.19 or newer.

1. Install dependencies: `npm install`.
2. Create a local environment file: `cp .env.example .env`.
3. Start PostgreSQL: `docker compose up -d postgres`.
4. Apply database migrations: `npm run db:deploy`.
5. Add `MAX_BOT_TOKEN`, `MAX_WEBHOOK_SECRET`, and admin user IDs.
6. Start development mode: `npm run dev`.
7. Check the service at `http://localhost:3000/health`.

MAX sends production updates to `POST /webhooks/max`. The public endpoint must use HTTPS on port 443 and the subscription secret must match `MAX_WEBHOOK_SECRET`.

Useful checks: `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.

## Schedule Commands

- `/events` lists active events in the current group.
- `/event_add 2026-09-20 10:00 | Воскресное собрание | Дом молитвы | 1020` creates a one-time event and reminds 1,020 minutes before it.
- `/event_weekly 7 10:00 | Воскресное собрание | Дом молитвы | 1020` creates a weekly Sunday event.
- `/event_delete EVENT_ID` disables an event.

Weekdays use ISO numbering: Monday is 1 and Sunday is 7. Administrative commands are restricted to IDs in `MAX_ADMIN_USER_IDS`.

## Reminder Worker

The reminder worker starts automatically when both `DATABASE_URL` and `MAX_BOT_TOKEN` are configured. It plans each occurrence in PostgreSQL, atomically claims due deliveries, and records successful or failed attempts. Failed sends retry with exponential backoff, up to five total attempts. `REMINDER_POLL_INTERVAL_MS` controls how often the worker checks the queue.

Run the PostgreSQL integration test with:

`DATABASE_URL=postgresql://postgres:postgres@localhost:5433/max_church_bot TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/max_church_bot npm test`
