# Project Vision

## One-Line Vision

Build a thoughtful MAX bot that helps a church community remember gatherings, revisit sermons during the week, and ask Bible-related questions in a safe and helpful way.

## Product Goal

The bot should become a practical assistant for church life. It should reduce organizational load for leaders, help members stay connected to weekly teaching, and provide simple access to Bible-based support inside the group where people already communicate.

## Primary Users

- Church members who receive reminders, sermon reflections, and answers to common questions.
- Pastors and leaders who manage events, sermon materials, and announcements.
- Admins who configure the bot, approve sensitive content, and monitor failures.

## MVP Capabilities

### Event Reminders

- Create one-time and recurring events.
- Store event date, time, title, location, description, topic, and optional Bible passage.
- Configure reminder time, for example Saturday at 17:00 for a Sunday 10:00 service.
- Send warm group messages before events.

### Sermon Processing

- Detect or receive sermon audio files in the MAX group.
- Store sermon metadata: date, speaker, title, source message, transcript status.
- Transcribe audio into text.
- Generate:
  - short summary;
  - key thoughts;
  - Bible references;
  - reflection questions;
  - follow-up posts for the next days.

### AI Assistant

- Answer Bible and church-life questions.
- Prefer humility and source references over confident speculation.
- Escalate sensitive, pastoral, theological, or personal crisis questions to leaders.
- Use church-approved guidelines and, later, the sermon archive as context.

### Admin Controls

- Admin-only commands for events, reminders, sermon review, and bot settings.
- Role model: owner, admin, leader, member.
- Basic audit log for important actions.

## Out Of Scope For MVP

- Multi-church SaaS billing.
- Complex CRM features.
- Full mobile app.
- Deep counseling automation.
- Fully automated public posting without review for sensitive AI outputs.

## Product Principles

- The bot assists the church; it does not replace pastoral care.
- Messages should sound warm, clear, and human.
- AI answers must be cautious, cite Scripture when possible, and admit uncertainty.
- Admins should be able to understand and recover from failures.
- Data privacy matters, especially for prayer requests and personal questions.

## Success Criteria

- Leaders can create and update the weekly schedule without developer help.
- The bot reliably sends event reminders.
- Sermon audio becomes a useful transcript and several follow-up posts.
- Members can ask simple Bible questions and receive helpful, bounded answers.
- A new developer can read the docs and continue from the current checklist.

