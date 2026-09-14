# Church Administrator Onboarding

1. Add the bot to the test group and channel; grant permission to read posts and publish messages.
2. Send `/whoami` privately and place that numeric ID in `TELEGRAM_ADMIN_USER_IDS` for the first administrator.
3. Use `/admin_add ID` for other leaders and `/settings` to verify roles.
4. Open `/admin` for the button dashboard. The guided event flow can be stopped at any time with `/cancel`.
5. Set community context with `/context_set TEXT`.
6. Create a test event from `/admin` or with `/event_add`/`/event_weekly`, then confirm it with `/events`.
7. Upload audio under 20 MB or use `/sermon_link HTTPS_URL` for a larger file. Track it with `/sermon_status ID`, inspect generated drafts with `/sermons`, and approve one with `/sermon_approve ID`.
8. Ask ordinary and sensitive test questions using `/ask` and confirm appropriate handling.
9. Complete every item in `docs/PILOT_CHECKLIST.md` before using the real church group.

Only trusted leaders should be administrators. AI answers and sermon drafts are assistance, not pastoral, medical, legal, or financial authority.
