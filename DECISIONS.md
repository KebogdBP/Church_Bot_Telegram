# Architecture Decision Log

Use this file to record meaningful technical and product decisions.

## ADR-0001: Build MVP With Large-System Architecture

Status: Proposed

Context:

The product vision includes reminders, sermon processing, AI Q&A, admin controls, and future expansion. Even though the first release is an MVP, the structure should not be a single script that becomes hard to maintain.

Decision:

Build the MVP as a modular service with clear boundaries: MAX adapter, command router, event service, sermon service, AI assistant service, scheduler, and database.

Consequences:

- Slightly more setup at the beginning.
- Much easier handoff between developers.
- Safer path toward future features like admin panel, prayer requests, and sermon archive search.

## ADR-0002: Prefer Admin Review For AI-Generated Group Posts

Status: Proposed

Context:

The bot will generate sermon follow-up posts and answer sensitive questions. Church communication should be careful and accountable.

Decision:

For MVP, generated sermon posts should be drafted and approved by admins before being posted automatically to the group.

Consequences:

- Less risk of awkward or theologically inaccurate public messages.
- Slightly more admin work.
- Review can later become optional per church setting.

