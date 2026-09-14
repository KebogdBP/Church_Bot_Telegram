# Roadmap

## Phase 0: Project Setup

Goal: prepare the repository and shared understanding.

- [x] Create initial documentation.
- [x] Create GitHub repository.
- [x] Choose implementation stack.
- [x] Add initial app skeleton.
- [x] Configure environment variables template.
- [x] Add local development instructions.

## Phase 1: Bot Foundation

Goal: connect to Telegram and establish the core runtime.

- [x] Research Telegram Bot API capabilities and limitations.
- [x] Implement webhook receiver.
- [x] Add message sending service.
- [x] Add command routing.
- [x] Add initial admin authorization.
- [x] Add structured logging.
- [x] Add initial error handling for failed API calls.
- [x] Create a real Telegram bot with BotFather and connect it through local polling.
- [x] Verify end-to-end private messaging with the Telegram bot.
- [ ] Register a production webhook and verify a test channel and discussion group.

Deliverable: bot can receive a message, recognize admins, and send a reply. Local implementation is complete; a Telegram token and public HTTPS endpoint are needed for end-to-end verification.

## Phase 2: Schedule And Reminders

Goal: manage church events and send reliable reminders.

- [x] Design event schema.
- [x] Implement recurring event support.
- [x] Implement reminder scheduling.
- [x] Add commands for creating, editing, listing, and deleting events.
- [x] Add reminder message templates.
- [x] Add timezone support.
- [x] Add tests for reminder timing.

Deliverable: admins can create, edit, list, and delete a Sunday service, and the bot reminds the group at the configured time. Implementation and database tests are complete; Telegram end-to-end verification remains part of the connection task.

## Phase 3: Sermon Audio Pipeline

Goal: turn sermon audio into reusable text and weekly content.

- [x] Accept audio files from Telegram.
- [x] Store original audio metadata.
- [x] Download accepted audio with bounded retries.
- [x] Accept sermon links from Telegram.
- [x] Integrate transcription provider.
- [x] Save transcript.
- [x] Generate sermon summary.
- [x] Generate key thoughts and reflection questions.
- [x] Generate scheduled follow-up posts.
- [x] Add admin review before sending generated posts.

Deliverable: a sermon audio file produces transcript, summary, and draft follow-up posts.

## Phase 4: AI Bible Assistant

Goal: answer basic Bible and church-related questions safely.

- [x] Define assistant behavior policy.
- [x] Add prompt templates.
- [x] Add Bible reference handling.
- [x] Add refusal and escalation rules.
- [x] Add admin-configurable church context.
- [x] Add conversation logging with privacy boundaries.
- [x] Add tests for sensitive cases.

Deliverable: members can ask questions and get cautious, useful answers.

## Phase 5: Admin Experience

Goal: make the MVP usable by non-developers.

- [x] Decide between command-only MVP and small web admin panel.
- [x] Add settings management.
- [x] Add sermon review workflow.
- [x] Add event management workflow.
- [x] Add role management.
- [x] Add basic dashboard or status command.

Deliverable: church leaders can operate the bot without editing code.

## Phase 6: Production Readiness

Goal: make the bot dependable enough for real church use.

- [x] Add deployment configuration.
- [x] Add database backups.
- [x] Add monitoring and health checks.
- [x] Add retry strategy for scheduled jobs.
- [x] Add security review.
- [x] Add onboarding guide.
- [ ] Run pilot in a test group.

Deliverable: MVP is ready for a real group pilot.

## Version 0.2: Community Experience

Goal: make the bot comfortable for everyday use and turn sermon transcripts into a useful, searchable church archive.

- [x] Add inline keyboards and guided administrator flows.
- [x] Notify administrators as sermon processing advances.
- [x] Add draft editing, rejection, and AI regeneration.
- [x] Generate and deliver a moderated weekly digest.
- [x] Add event RSVP with aggregate counts.
- [x] Search sermon transcripts and cite sermon/date excerpts.
- [x] Complete production regression, security review, and operator documentation.

Deliverable: leaders can operate the core workflows from buttons, members can register for events and search the sermon archive, and no AI-generated content is published without explicit approval.
