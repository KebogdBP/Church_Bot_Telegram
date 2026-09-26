# Version 0.4 Expansion Roadmap

This is the implementation plan for the full church assistant beyond the MVP. Each phase must preserve admin approval, group scoping, retry safety, privacy, and a working fallback path.

## Phase 0: Foundation and observability

- [x] Add a single processing timeline for download, conversion, transcription, analysis, image generation, and delivery.
- [x] Add human-readable failure messages and administrator diagnostics.
- [ ] Add provider latency, token, and failure metrics without logging sermon text.
- [ ] Add regression fixtures for short, long, malformed, and unavailable media.

## Phase 1: Sermon archive and grounded search

- [x] Optional: use Telegram Local Bot API Server to accept direct audio above the hosted 20 MB download limit.

- [ ] Store sermon title, speaker, date, themes, Bible references, outline, and full transcript.
- [x] Add `/sermon_show` with structured outline and Telegram-safe full transcript chunks.
- [x] Add `/ask_sermon ID QUESTION` against a selected sermon.
- [ ] Return bounded verbatim excerpts with sermon ID and section context.
- [ ] Add PostgreSQL full-text search; evaluate embeddings only after measuring workload.
- [ ] Keep group isolation and never invent citations.

## Phase 2: Complete sermon analysis

- [x] Persist a structured outline with numbered sections and supporting points.
- [ ] Separate transcript, factual extraction, interpretation, and generated application.
- [ ] Identify key thoughts only when grounded in the transcript.
- [ ] Generate discussion questions and a leader version.
- [ ] Process long sermons in chunks and merge results deterministically.

## Phase 3: Moderated visual publications

- [x] Add an image-generation provider interface with configurable Cloudflare and OpenRouter providers.
- [x] Generate one image per approved draft or daily devotional from the stored image prompt.
- [ ] Store image metadata and local/object-storage path, never provider secrets.
- [x] Publish a Telegram photo with a structured caption; split long captions into a following message.
- [x] Fall back to text-only delivery when image generation fails.

## Phase 4: Publication series and digests

- [x] Schedule one morning, afternoon, and evening post for 3–7 days.
- [ ] Support series pause, resume, reorder, preview, and regeneration before publication.
- [ ] Add daily and weekly digests with moderation.
- [x] Avoid duplicate bursts when several sermons are approved.

## Phase 5: Home groups and pastoral tools

- [ ] Generate a five-question home-group guide from a sermon.
- [ ] Provide leader and participant versions.
- [ ] Add prayer themes and a weekly practice.
- [ ] Add sermon preparation support for pastors, clearly labelled as a draft.

## Phase 6: Prayer requests and care

- [ ] Keep private requests encrypted and group-scoped.
- [ ] Add acknowledge, archive, consent-to-share, and anonymized publication workflows.
- [ ] Add prayer reminders and "I prayed" aggregate counts without member lists.
- [ ] Keep deterministic escalation for crisis, abuse, medical, legal, and financial situations.

## Phase 7: Schedule, announcements, and participation

- [ ] Add a calendar view and weekly schedule summary.
- [ ] Add RSVP reports for leaders without exposing personal attendance.
- [x] Add configurable private registrations with total capacity, city quotas, custom fields, cancellation, and CSV reporting.
- [ ] Add moderated announcement templates, proofreading, and optional images.

## Phase 8: Administration and operations

- [ ] Build a small authenticated admin web panel after command workflows stabilize.
- [ ] Show queue health, drafts, schedules, failed jobs, API usage, and backups.
- [ ] Add role separation for pastor, editor, and technical administrator.
- [ ] Add export, restore, retention preview, and audit filtering.

## Phase 9: Voice and languages

- [ ] Accept voice questions and return text answers.
- [ ] Add optional text-to-speech answers with explicit user opt-in.
- [ ] Add Russian and English first; add further languages only after quality review.
- [ ] Translate generated posts while preserving source references.

## Definition of done for every phase

Domain tests, provider failure tests, Telegram transport tests, PostgreSQL integration coverage where persistence changes, updated operator documentation, migration review, deployment, and a real smoke test on Raspberry Pi.

## Current implementation point

The MVP has full audio transcription, archive search, contextual Bible Q&A, structured sermon analysis, moderated scheduled drafts, prayers, announcements, retention, audit, compact sermon IDs, rich event announcements, and an isolated outbound VPN route. Phase 0 now includes a unified administrator timeline and safe diagnostics. Provider metrics and media regression fixtures remain before Phase 0 is complete.
