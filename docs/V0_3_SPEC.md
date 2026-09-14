# Version 0.3 Specification

## Principles

- Sensitive member content is private by default and shared only after explicit consent.
- AI answers distinguish Scripture, archived sermon material, and model explanation.
- Public announcements and prayer-request publications require administrator approval.
- Every consequential administrator mutation records who acted, when, and on which entity.
- Retention jobs delete only data covered by explicit group settings and preserve minimal audit metadata.

## Phase 1: Archive-Grounded Answers

- Ordinary private text is answered by the existing Bible assistant without requiring a slash command; ordinary group text is ignored.
- Private audio and voice messages are transcribed automatically and returned in ordered Telegram-sized parts without generating sermon posts.
- `/ask_sermons QUESTION` retrieves bounded excerpts only from completed transcripts in the current group.
- Gemini receives those excerpts as optional context and must cite sermon IDs used in the answer.
- A deterministic source list is appended by the application; the model cannot invent its entries.
- Existing `/ask` behavior and safety escalation remain unchanged.
- Implemented with bounded keyword retrieval, prompt-injection isolation, and an application-validated source allowlist.

## Phase 2: Moderated Announcements

- Administrators create, preview, edit, reject, schedule, and approve announcements.
- Delivery uses durable claims, stale recovery, bounded retries, and idempotent state transitions.
- No draft is published without explicit approval.
- Implemented with audited draft states, timezone-aware scheduling, conditional claims, stale recovery, and bounded retries.

## Phase 3: Private Prayer Requests

- Requests are accepted in private bot chats only.
- The member chooses private-leaders-only or consent-to-anonymous-group-sharing.
- Leaders can acknowledge, archive, or approve an anonymized public draft.
- Raw request text never appears in operational logs.
- Implemented with private-chat enforcement, explicit visibility, group-scoped leader authorization, and a durable anonymous-publication worker.

## Phase 4: Audit And Operations

- Event, sermon moderation, digest, announcement, role, and prayer-request mutations create audit records.
- `/activity` is administrator-only and shows bounded metadata without sensitive text.
- Failed durable jobs are summarized for administrators without exposing transcripts or requests.
- Implemented with a group-scoped append-only audit table, bounded `/activity` output, safe metadata allowlisting, and aggregate failed-job counts.

## Phase 5: Data Lifecycle

- Groups configure retention for stored audio, transcripts, and private prayer requests.
- A dry-run command reports what would be removed.
- Deletion is explicit, auditable, and retry-safe.

## Definition Of Done

Each phase requires domain tests, Telegram transport tests, PostgreSQL integration coverage, updated operator documentation, and a separate commit. The release requires clean migrations, full tests, typecheck, lint, production build, dependency audit, Docker smoke test, and a tagged release.
