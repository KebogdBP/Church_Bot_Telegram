# Telegram Church Bot

MVP bot for a church community in Telegram: channel reminders, sermon audio processing, AI-assisted Bible Q&A, and reusable church communication workflows.

## Project Status

Current phase: version 0.3 data lifecycle. The administrator audit and operations phase is complete.

See [ROADMAP.md](ROADMAP.md) for the implementation path and [TASKS.md](TASKS.md) for the live checklist.
The post-MVP expansion plan is in [docs/V0_4_ROADMAP.md](docs/V0_4_ROADMAP.md).

Administrators can use `/activity` to inspect the latest 20 consequential actions and the total number of failed background jobs. Audit entries contain actor/action/entity identifiers and safe metadata only; announcement text, prayer requests, transcripts, and AI context are never copied into the audit log.

AI text generation uses OpenRouter where structured or archive-aware output is required, with Gemini and Groq fallbacks for supported flows. Groq Whisper remains the transcription provider. Cloudflare Workers AI is the primary image generator when configured; OpenRouter is its automatic fallback. Provider traffic uses the isolated application proxy where required.

### Data retention

Retention is configured separately for stored sermon audio, transcripts, and private prayer requests. Defaults are 90 days for audio and 365 days for transcripts and prayer requests.

```text
/retention
/retention_set audio 90
/retention_set transcripts 365
/retention_set prayers 365
/retention_dry_run
/retention_run CONFIRM
```

Only administrators can use these commands. Always inspect `/retention_dry_run` first. Cleanup is scoped to the current group, excludes prayer requests currently being published, uses a group-level database lock, and records counts rather than deleted content in `/activity`.

## MVP Scope

- Manage church events and recurring schedule.
- Send reminders before events.
- Accept sermon audio from the group.
- Transcribe sermon audio.
- Generate sermon summary, key thoughts, reflection questions, and follow-up posts.
- Answer Bible and church-related questions with a cautious AI assistant.
- Support admin-only commands for configuration and moderation.
- Create limited-capacity registrations with city quotas and private participant forms.

## Documentation

- [PROJECT_VISION.md](PROJECT_VISION.md): product vision, users, principles, and MVP boundaries.
- [ROADMAP.md](ROADMAP.md): phased implementation plan.
- [TASKS.md](TASKS.md): current execution checklist for developers.
- [ARCHITECTURE.md](ARCHITECTURE.md): proposed technical architecture.
- [CONTRIBUTING.md](CONTRIBUTING.md): workflow for future contributors.
- [DECISIONS.md](DECISIONS.md): architecture decision log.
- [docs/TELEGRAM_API.md](docs/TELEGRAM_API.md): verified Telegram API behavior and setup.
- [docs/AI_SAFETY.md](docs/AI_SAFETY.md): Bible assistant boundaries, escalation, and privacy policy.
- [docs/REGISTRATION.md](docs/REGISTRATION.md): registration setup, participant flow, quotas, export, and privacy.

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

The hosted Telegram Bot API allows bots to download files up to 20 MB. `SERMON_MAX_FILE_SIZE_BYTES` defaults to that limit. The Raspberry Pi deployment uses Telegram's local Bot API (`TELEGRAM_LOCAL=1`) and sets this value to 500 MB, so larger audio files can be downloaded there. Oversized files are recorded without repeatedly attempting a download. Temporary failures retry with exponential backoff, up to five attempts.

## Sermon Transcription

When `GROQ_API_KEY` is configured, a background worker sends stored sermon audio to Groq Speech-to-Text. The default model is `whisper-large-v3-turbo` with Russian language guidance. The full transcript, model name, processing status, attempt count, and errors are persisted in PostgreSQL. Configure it with `GROQ_TRANSCRIPTION_MODEL`, `TRANSCRIPTION_LANGUAGE`, and `TRANSCRIPTION_POLL_INTERVAL_MS`.

After transcription, a content worker uses Gemini structured output to generate a summary, key thoughts, reflection questions, and follow-up post drafts. Generated drafts remain unpublished until an administrator approves them. Gemini also powers `/ask`; urgent safety routing happens locally before any provider request.

Administrators can send a public YouTube, RuTube, VK Video, OK, MAX, or direct audio HTTPS link as a standalone message, or use `/sermon_link URL`. Platform links are processed by `yt-dlp` through the bot-only proxy; playlists, private media, DRM-protected media, and links requiring an account are intentionally unsupported. After download, the normal transcription and AI-analysis pipeline runs automatically.

Every accepted audio or link receives a compact six-character code such as `A7K3P9`. Use it with `/sermon_status A7K3P9` and `/sermon_regenerate A7K3P9`. Commands still accept legacy long IDs for previously received sermons.

Large sermons can be submitted with `/sermon_link HTTPS_URL`. Public linked files are accepted up to `SERMON_MAX_LINK_FILE_SIZE_BYTES` (500 MB by default), normalized to 16 kHz mono OGG/Opus with `ffmpeg`, split into one-hour segments, transcribed sequentially by Groq, and joined before Gemini analysis. Use `/sermon_status ID` to monitor every stage. Direct Telegram uploads remain subject to Telegram Cloud Bot API's 20 MB download limit.

The administrator who submitted a sermon receives private milestone notifications when the file is stored, transcription finishes, generated materials become ready, or a processing stage reaches a terminal failure. Notifications contain no transcript text, are deduplicated in PostgreSQL, and retry after temporary Telegram errors. `SERMON_NOTIFICATION_POLL_INTERVAL_MS` controls the polling interval.

Administrators moderate AI drafts before publication. `/sermons` and `/sermon_review ID` expose approval and rejection buttons; `/sermon_edit ID | TEXT` edits a draft, `/sermon_reject ID` rejects it, and `/sermon_regenerate SERMON_ID` rebuilds an entirely unpublished series. Moderator IDs and timestamps are retained for audit. Regeneration is refused after any post in the series has been scheduled or published.

Each newly analyzed sermon produces 6–12 concise follow-up drafts. Approving any draft approves its sermon series and schedules up to three posts per day at 09:00, 14:00, and 19:00 in the group timezone, starting the next day. Existing scheduled posts reserve their slots, so multiple sermons do not create simultaneous bursts.

Weekly digests remain moderated. `/digest_enable 1-7 HH:MM` enables automatic weekly draft creation in the group timezone, `/digest_preview` creates or refreshes the current draft, and `/digest_approve ID` authorizes delivery. `/digest_disable` turns off automatic drafting. Approved deliveries are durable and retry temporary Telegram failures; `WEEKLY_DIGEST_POLL_INTERVAL_MS` controls worker polling.

Daily devotional delivery is enabled per chat from **Admin → Settings → Devotional**. At the configured local time, the bot draws on completed sermon material from that same chat and publishes a compact mobile reading with Scripture, reflection, one practical step, prayer, and a question. New devotionals include a topic-aware image. Configure Cloudflare with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; if image generation is unavailable, the devotional is still delivered as text.

`/events` includes RSVP buttons for every visible event. Any group member can choose "пойду", "возможно", or "не смогу" and change that choice later. The bot stores one current response per Telegram user and event, validates that the event belongs to the current chat, and posts aggregate counts without exposing a member list.

The guided event flow is available from `/admin` → **События** → **Добавить событие**. It asks for the date, time, title, a short description, location, reminder offset, and an optional Telegram photo. Reminders with a photo are sent as a single mobile-friendly image post with a formatted caption; events without a photo use the same structured text layout. Telegram stores the uploaded media, while the bot persists only its reusable `file_id` and `file_unique_id`.

Members can search completed sermon transcripts with `/sermon_search QUERY`. Results are scoped to the current Telegram group and show the stored sermon title, date, ID, and a bounded verbatim excerpt around the match. This command does not ask an AI model to create or paraphrase citations.

`/ask_sermons QUESTION` asks the Bible assistant with up to three bounded excerpts retrieved from completed transcripts in the current group. Archive text is treated as untrusted reference material, and the application appends only source IDs that were actually retrieved; model-invented IDs are discarded. Use `/ask` when archive context is not wanted.

Administrators create announcement drafts with `/announce_new TEXT`, list them with `/announcements`, and use `/announce_edit ID | TEXT`, `/announce_reject ID`, or `/announce_approve ID [YYYY-MM-DD HH:MM]`. Approval without a date sends as soon as the worker claims the draft. All moderator identities and timestamps are retained, and temporary Telegram failures retry durably according to `ANNOUNCEMENT_POLL_INTERVAL_MS`.

Prayer requests are accepted only in a private chat. A member obtains the group ID with `/church_id` in the church group, then privately sends `/prayer_to GROUP_ID private | TEXT` for leaders only or `/prayer_to GROUP_ID share | TEXT` to permit a separately reviewed anonymous publication. Leaders use `/prayers GROUP_ID`, `/prayer_ack ID`, `/prayer_archive ID`, and `/prayer_publish ID | ANONYMOUS TEXT`. The original request is never published by the delivery worker.

Administrators review drafts with `/sermons` and `/sermon_review ID`. `/sermon_approve ID` approves the entire sermon series and schedules up to three posts per day. A durable worker sends only approved posts and retries temporary Telegram failures up to five times.

## Bible Assistant

Members ask explicit questions with `/ask ВОПРОС`. The assistant returns a cautious Russian answer and a separate list of Bible references. Crisis, abuse, medical, legal, and financial-decision requests are redirected without calling AI. `/context_set ТЕКСТ` lets an administrator configure local church context. Conversation text is not retained in audit logs.

In a private chat with the bot, members can also send an ordinary text question without a slash command. The assistant remembers up to 10 recent question-answer pairs for 30 days, with a 12,000-character provider context budget. Turns are isolated per user and chat, encrypted at rest with the application privacy secret, and never written to operational or audit logs. `/new_chat` permanently deletes the current conversation history. Free-form group messages are ignored so the bot does not interrupt normal conversation. Groq Whisper remains dedicated to sermon audio transcription.

Audio, voice messages, and audio documents sent directly to the bot are treated as personal transcription requests. Any user may submit them in a private chat; Groq Whisper transcribes the stored audio and the bot returns the complete escaped transcript in ordered Telegram-sized parts. Personal transcriptions never enter Gemini sermon-content generation or create church publication drafts. Group and channel audio keeps the administrator-controlled sermon workflow.

## Administration

The MVP uses Telegram commands rather than a separate web panel. Bootstrap administrators come from `TELEGRAM_ADMIN_USER_IDS`; `/admin_add ID` and `/admin_remove ID` manage persistent group-scoped roles. `/settings` shows group configuration and `/status` reports operational counts for events and sermon processing.
