# Roadmap

## Phase 0: Project Setup

Goal: prepare the repository and shared understanding.

- [x] Create initial documentation.
- [ ] Create GitHub repository.
- [ ] Choose implementation stack.
- [ ] Add initial app skeleton.
- [ ] Configure environment variables template.
- [ ] Add local development instructions.

## Phase 1: Bot Foundation

Goal: connect to MAX and establish the core runtime.

- [ ] Research MAX Bot API capabilities and limitations.
- [ ] Implement webhook or polling receiver.
- [ ] Add message sending service.
- [ ] Add command routing.
- [ ] Add admin authorization.
- [ ] Add structured logging.
- [ ] Add error handling for failed API calls.

Deliverable: bot can receive a message, recognize admins, and send a reply.

## Phase 2: Schedule And Reminders

Goal: manage church events and send reliable reminders.

- [ ] Design event schema.
- [ ] Implement recurring event support.
- [ ] Implement reminder scheduling.
- [ ] Add commands for creating, editing, listing, and deleting events.
- [ ] Add reminder message templates.
- [ ] Add timezone support.
- [ ] Add tests for reminder timing.

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

