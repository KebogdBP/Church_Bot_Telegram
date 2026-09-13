# Architecture Decision Log

Use this file to record meaningful technical and product decisions.

## ADR-0001: Build MVP With Large-System Architecture

Status: Accepted

Context:

The product vision includes reminders, sermon processing, AI Q&A, admin controls, and future expansion. Even though the first release is an MVP, the structure should not be a single script that becomes hard to maintain.

Decision:

Build the MVP as a modular service with clear boundaries: messenger adapter, command router, event service, sermon service, AI assistant service, scheduler, and database.

Consequences:

- Slightly more setup at the beginning.
- Much easier handoff between developers.
- Safer path toward future features like admin panel, prayer requests, and sermon archive search.

## ADR-0002: Prefer Admin Review For AI-Generated Group Posts

Status: Accepted

Context:

The bot will generate sermon follow-up posts and answer sensitive questions. Church communication should be careful and accountable.

Decision:

For MVP, generated sermon posts should be drafted and approved by admins before being posted automatically to the group.

Consequences:

- Less risk of awkward or theologically inaccurate public messages.
- Slightly more admin work.
- Review can later become optional per church setting.

## ADR-0003: TypeScript Service With A Thin MAX Adapter

Status: Superseded by ADR-0006

Context:

MAX recommends webhook delivery for production. The application needs to own its HTTPS endpoint, secret validation, persistence, and domain boundaries.

Decision:

Use Node.js with TypeScript and Fastify. Keep MAX HTTP calls and update normalization in a thin adapter so domain services remain independent of messenger-specific payloads. Use PostgreSQL with Prisma and Redis-backed jobs as later phases require them.

Consequences:

- Webhook behavior is explicit and straightforward to test.
- MAX API changes are isolated to one module.
- We own retry and rate-limit behavior and must implement it before production launch.

## ADR-0004: PostgreSQL With Prisma 6 For Durable State

Status: Accepted

Context:

Events, recurring schedules, and reminder deliveries must survive process restarts. Prisma 8 requires a newer Node.js baseline, while Prisma 7 currently introduces vulnerable development dependencies in this project.

Decision:

Use PostgreSQL 17 and Prisma 6.12 for the MVP. Keep persistence behind repository interfaces so domain tests do not depend on a running database.

Consequences:

- Local development has a reproducible Docker database.
- The project keeps its Node.js 20.19 minimum.
- Upgrading Prisma can happen separately after its runtime and dependency requirements are reviewed.

## ADR-0005: PostgreSQL-Backed Reminder Worker Before Redis

Status: Accepted

Context:

The MVP needs dependable reminders, but does not yet need the operational overhead of a second persistence system. PostgreSQL already stores events and can coordinate delivery claims safely.

Decision:

Use a polling worker backed by the `ReminderDelivery` table. Enforce one delivery per event occurrence, claim jobs conditionally, recover stale processing jobs, and retry failures with exponential backoff. Revisit BullMQ and Redis when workload or horizontal scaling demonstrates the need.

Consequences:

- Reminder state remains visible and recoverable in one database.
- The MVP has fewer infrastructure dependencies.
- Polling introduces up to `REMINDER_POLL_INTERVAL_MS` of delivery latency.

## ADR-0006: Pivot The Messenger Integration To Telegram

Status: Accepted

Context:

The project needs a bot that can be launched and piloted without organizational verification and platform moderation. Telegram provides immediate bot creation through BotFather and supports channels, discussion groups, private chats, webhook delivery, and audio attachments.

Decision:

Replace the MAX integration with Telegram Bot API. Use a Telegram channel for announcements and reminders, and a linked discussion group or private bot chat for interactive commands and future Bible Q&A. Preserve the messenger-independent event, reminder, and persistence services.

Consequences:

- Existing schedule and reminder logic remains intact.
- MAX-specific environment variables, webhook payloads, API client, and documentation are removed.
- Database columns are renamed through a forward migration, preserving stored events.
- Channel publishing and interactive conversations use different Telegram chat contexts.
