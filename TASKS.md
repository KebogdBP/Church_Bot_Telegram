# Live Project Checklist

This file is the shared handoff point for all developers. Update it whenever work starts, pauses, or completes.

## Current Status

Phase: 0 - Project Setup

Current focus: create repository, decide stack, and scaffold the app.

## Active Tasks

- [ ] Confirm GitHub repository name and visibility.
- [ ] Create remote repository.
- [ ] Decide backend stack.
- [ ] Create initial app skeleton.
- [ ] Add `.env.example`.
- [ ] Add first local run command.

## Done

- [x] Draft project vision.
- [x] Draft implementation roadmap.
- [x] Draft architecture outline.
- [x] Draft contribution workflow.
- [x] Draft decision log.

## Decisions Needed

- Repository name.
- Public or private repository.
- Backend language and framework.
- Database choice for MVP.
- Hosting target.
- AI providers for transcription and text generation.
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

