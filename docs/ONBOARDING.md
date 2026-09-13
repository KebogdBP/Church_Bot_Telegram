# Church Administrator Onboarding

1. Add the bot to the test group and channel; grant permission to read posts and publish messages.
2. Send `/whoami` privately and place that numeric ID in `TELEGRAM_ADMIN_USER_IDS` for the first administrator.
3. Use `/admin_add ID` for other leaders and `/settings` to verify roles.
4. Set community context with `/context_set TEXT`.
5. Create a test event with `/event_add` or `/event_weekly`, then confirm it with `/events`.
6. Upload a short audio sermon or use `/sermon_link HTTPS_URL`, wait for processing, inspect `/sermons`, and approve it with `/sermon_approve ID`.
7. Ask ordinary and sensitive test questions using `/ask` and confirm appropriate handling.
8. Complete every item in `docs/PILOT_CHECKLIST.md` before using the real church group.

Only trusted leaders should be administrators. AI answers and sermon drafts are assistance, not pastoral, medical, legal, or financial authority.
