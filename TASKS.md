# Live Project Checklist

This file is the shared handoff point for all developers. Update it whenever work starts, pauses, or completes.

## Current Status

Phase: 2 - Schedule And Reminders

Current focus: finish durable reminder delivery while MAX credentials and hosting are pending.

## Active Tasks

- [ ] Create a bot in MAX and obtain its token.
- [ ] Choose a deployment target with HTTPS on port 443.
- [ ] Register the MAX webhook subscription.
- [ ] Add the bot to a MAX test group.
- [ ] Verify `/help` and admin-only `/status` end to end.
- [ ] Implement the durable reminder worker.
- [ ] Add reminder message templates.
- [ ] Add event editing command.

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
- [x] Add MAX webhook validation and update normalization.
- [x] Add MAX message sender and command router.
- [x] Add initial admin authorization.
- [x] Add automated tests for the foundation.
- [x] Record verified MAX API constraints and source links.
- [x] Add PostgreSQL and Prisma event schema with an initial migration.
- [x] Add one-time and weekly event creation.
- [x] Add `/events`, `/event_add`, `/event_weekly`, and `/event_delete`.
- [x] Add timezone-aware reminder calculation.
- [x] Verify the migration against PostgreSQL 17 in Docker.

## Decisions Needed

- Hosting target.
- Confirm production PostgreSQL and Redis hosting approach.
- Confirm OpenAI as transcription and text generation provider before Phase 3.
- Whether admin UX starts as commands only or includes a web panel.

## Recommended MVP Stack

- Backend: TypeScript with Node.js.
- Bot runtime: webhook-first if MAX supports it, polling fallback if needed.
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

Last tested commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

Implementation note: MAX production delivery uses webhook at `POST /webhooks/max`; requests are checked against `X-Max-Bot-Api-Secret` when `MAX_WEBHOOK_SECRET` is configured.
