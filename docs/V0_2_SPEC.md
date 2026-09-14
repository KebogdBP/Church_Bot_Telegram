# Version 0.2 Specification

## Principles

- Keep every existing command working while adding button-based flows.
- Recheck authorization on every callback; button visibility is not authorization.
- Keep AI output as a draft until an administrator explicitly approves it.
- Do not store sensitive free-form conversations beyond the existing privacy policy.
- Make background work observable without flooding the church group.
- Keep callbacks idempotent so repeated taps do not duplicate actions.

## Phase 1: Interactive Administration

- `/admin` opens an inline dashboard.
- Event and sermon messages include relevant action buttons.
- Guided event creation stores short-lived conversation state in PostgreSQL.
- `/cancel` safely abandons an unfinished flow.

## Phase 2: Sermon Progress

- The submitting administrator receives milestone notifications for download, transcription, Gemini content generation, and failures.
- Notifications are deduplicated and avoid sending transcript or private content.
- Implemented with durable `SermonNotification` records, stale-delivery recovery, and exponential retry backoff.

## Phase 3: Draft Moderation

- Administrators can edit, reject, regenerate, review, and approve drafts.
- Regeneration replaces only unpublished drafts and records the responsible administrator.
- Implemented with inline review controls, command-based text editing, and transactional audit fields.

## Phase 4: Weekly Digest

- Administrators can preview and approve a digest assembled from events and the latest approved sermon material.
- Delivery is scheduled and retried durably.

## Phase 5: Event RSVP

- Members can answer Going, Maybe, or Not going using inline buttons.
- One current response per Telegram user and event is stored.
- Group messages show aggregate counts, not a public member list.

## Phase 6: Sermon Archive Search

- Members search with `/sermon_search QUERY`.
- Results include the sermon identifier, title/date, and a bounded transcript excerpt.
- Search is scoped to the current church group and never invents citations.

## Definition Of Done

Each phase requires domain tests, transport tests, database integration coverage where applicable, updated user/operator documentation, a clean typecheck/lint/build, and an individual Git commit pushed to `main`.
