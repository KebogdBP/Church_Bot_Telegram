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
- [docs/AI_SAFETY.md](docs/AI_SAFETY.md): Bible assistant boundaries, escalation, and privacy policy.

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

When `GROQ_API_KEY` is configured, a background worker sends stored sermon audio to Groq Speech-to-Text. The default model is `whisper-large-v3-turbo` with Russian language guidance. The full transcript, model name, processing status, attempt count, and errors are persisted in PostgreSQL. Configure it with `GROQ_TRANSCRIPTION_MODEL`, `TRANSCRIPTION_LANGUAGE`, and `TRANSCRIPTION_POLL_INTERVAL_MS`.

After transcription, a content worker uses Gemini structured output to generate a summary, key thoughts, reflection questions, and follow-up post drafts. Generated drafts remain unpublished until an administrator approves them. Gemini also powers `/ask`; urgent safety routing happens locally before any provider request.

Large sermons can be submitted with `/sermon_link HTTPS_URL`. Public linked files are accepted up to `SERMON_MAX_LINK_FILE_SIZE_BYTES` (500 MB by default), normalized to 16 kHz mono OGG/Opus with `ffmpeg`, split into one-hour segments, transcribed sequentially by Groq, and joined before Gemini analysis. Use `/sermon_status ID` to monitor every stage. Direct Telegram uploads remain subject to Telegram Cloud Bot API's 20 MB download limit.

The administrator who submitted a sermon receives private milestone notifications when the file is stored, transcription finishes, generated materials become ready, or a processing stage reaches a terminal failure. Notifications contain no transcript text, are deduplicated in PostgreSQL, and retry after temporary Telegram errors. `SERMON_NOTIFICATION_POLL_INTERVAL_MS` controls the polling interval.

Administrators moderate AI drafts before publication. `/sermons` and `/sermon_review ID` expose approval and rejection buttons; `/sermon_edit ID | TEXT` edits a draft, `/sermon_reject ID` rejects it, and `/sermon_regenerate SERMON_ID` rebuilds an entirely unpublished series. Moderator IDs and timestamps are retained for audit. Regeneration is refused after any post in the series has been scheduled or published.

Weekly digests remain moderated. `/digest_enable 1-7 HH:MM` enables automatic weekly draft creation in the group timezone, `/digest_preview` creates or refreshes the current draft, and `/digest_approve ID` authorizes delivery. `/digest_disable` turns off automatic drafting. Approved deliveries are durable and retry temporary Telegram failures; `WEEKLY_DIGEST_POLL_INTERVAL_MS` controls worker polling.

`/events` includes RSVP buttons for every visible event. Any group member can choose "пойду", "возможно", or "не смогу" and change that choice later. The bot stores one current response per Telegram user and event, validates that the event belongs to the current chat, and posts aggregate counts without exposing a member list.

Members can search completed sermon transcripts with `/sermon_search QUERY`. Results are scoped to the current Telegram group and show the stored sermon title, date, ID, and a bounded verbatim excerpt around the match. This command does not ask an AI model to create or paraphrase citations.

`/ask_sermons QUESTION` asks the Bible assistant with up to three bounded excerpts retrieved from completed transcripts in the current group. Archive text is treated as untrusted reference material, and the application appends only source IDs that were actually retrieved; model-invented IDs are discarded. Use `/ask` when archive context is not wanted.

Administrators create announcement drafts with `/announce_new TEXT`, list them with `/announcements`, and use `/announce_edit ID | TEXT`, `/announce_reject ID`, or `/announce_approve ID [YYYY-MM-DD HH:MM]`. Approval without a date sends as soon as the worker claims the draft. All moderator identities and timestamps are retained, and temporary Telegram failures retry durably according to `ANNOUNCEMENT_POLL_INTERVAL_MS`.

Prayer requests are accepted only in a private chat. A member obtains the group ID with `/church_id` in the church group, then privately sends `/prayer_to GROUP_ID private | TEXT` for leaders only or `/prayer_to GROUP_ID share | TEXT` to permit a separately reviewed anonymous publication. Leaders use `/prayers GROUP_ID`, `/prayer_ack ID`, `/prayer_archive ID`, and `/prayer_publish ID | ANONYMOUS TEXT`. The original request is never published by the delivery worker.

Administrators review drafts with `/sermons` and `/sermon_review ID`. `/sermon_approve ID` approves the entire sermon series and schedules one post per day. A durable worker sends only approved posts and retries temporary Telegram failures up to five times.

## Bible Assistant

Members ask explicit questions with `/ask ВОПРОС`. The assistant returns a cautious Russian answer and a separate list of Bible references. Crisis, abuse, medical, legal, and financial-decision requests are redirected without calling AI. `/context_set ТЕКСТ` lets an administrator configure local church context. Conversation text is not retained in audit logs.

In a private chat with the bot, members can also send an ordinary text question without a slash command. The same local safety checks, Gemini provider, privacy-preserving metadata log, and pastoral escalation rules apply. Free-form group messages are ignored so the bot does not interrupt normal conversation. Groq Whisper remains dedicated to sermon audio transcription.

## Administration

The MVP uses Telegram commands rather than a separate web panel. Bootstrap administrators come from `TELEGRAM_ADMIN_USER_IDS`; `/admin_add ID` and `/admin_remove ID` manage persistent group-scoped roles. `/settings` shows group configuration and `/status` reports operational counts for events and sermon processing.
