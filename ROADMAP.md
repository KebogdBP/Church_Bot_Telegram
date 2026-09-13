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

Goal: connect to MAX and establish the core runtime.

- [x] Research MAX Bot API capabilities and limitations.
- [x] Implement webhook receiver.
- [x] Add message sending service.
- [x] Add command routing.
- [x] Add initial admin authorization.
- [x] Add structured logging.
- [x] Add initial error handling for failed API calls.
- [ ] Register a real MAX bot and webhook subscription.
- [ ] Verify end-to-end messaging in a MAX test group.

Deliverable: bot can receive a message, recognize admins, and send a reply. Local implementation is complete; real MAX credentials and a public HTTPS endpoint are needed for end-to-end verification.

## Phase 2: Schedule And Reminders

Goal: manage church events and send reliable reminders.

- [x] Design event schema.
- [x] Implement recurring event support.
- [ ] Implement reminder scheduling.
- [ ] Add commands for creating, editing, listing, and deleting events. Create, list, and delete are complete; edit remains.
- [ ] Add reminder message templates.
- [x] Add timezone support.
- [x] Add tests for reminder timing.

Deliverable: admins can create a Sunday service and the bot reminds the group at the configured time.

## Phase 3: Sermon Audio Pipeline

Goal: turn sermon audio into reusable text and weekly content.

- [ ] Accept audio files or links from MAX.
- [ ] Store original audio metadata.
- [ ] Integrate transcription provider.
- [ ] Save transcript.
- [ ] Generate sermon summary.
- [ ] Generate key thoughts and reflection questions.
- [ ] Generate scheduled follow-up posts.
- [ ] Add admin review before sending generated posts.

Deliverable: a sermon audio file produces transcript, summary, and draft follow-up posts.

## Phase 4: AI Bible Assistant

Goal: answer basic Bible and church-related questions safely.

- [ ] Define assistant behavior policy.
- [ ] Add prompt templates.
- [ ] Add Bible reference handling.
- [ ] Add refusal and escalation rules.
- [ ] Add admin-configurable church context.
- [ ] Add conversation logging with privacy boundaries.
- [ ] Add tests for sensitive cases.

Deliverable: members can ask questions and get cautious, useful answers.

## Phase 5: Admin Experience

Goal: make the MVP usable by non-developers.

- [ ] Decide between command-only MVP and small web admin panel.
- [ ] Add settings management.
- [ ] Add sermon review workflow.
- [ ] Add event management workflow.
- [ ] Add role management.
- [ ] Add basic dashboard or status command.

Deliverable: church leaders can operate the bot without editing code.

## Phase 6: Production Readiness

Goal: make the bot dependable enough for real church use.

- [ ] Add deployment configuration.
- [ ] Add database backups.
- [ ] Add monitoring and health checks.
- [ ] Add retry strategy for scheduled jobs.
- [ ] Add security review.
- [ ] Add onboarding guide.
- [ ] Run pilot in a test group.

Deliverable: MVP is ready for a real group pilot.
