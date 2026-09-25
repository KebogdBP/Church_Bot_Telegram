# Registration Module

The registration module lets a church-group administrator configure limited-capacity events entirely with Telegram buttons.

## Administrator flow

1. Open **For ministers → Registrations → New registration**.
2. Enter a title and choose a total capacity, or enter a custom limit from 1 to 10,000.
3. Add one or more cities and a quota for each city.
4. Optionally add custom questions. Supported answers are text, number, and a button choice with 2–10 options.
5. Add a short public description.
6. Open registration and publish the generated announcement.

The form dashboard shows total occupancy, city capacity, custom fields, and status. Administrators can change the total limit and city quotas as long as the new number is not below the number of confirmed participants. The participant list and UTF-8 CSV export are sent only to the requesting administrator's private chat, never to the church group.

## Participant flow

The public button opens a Telegram deep link to the bot. Personal details are collected in a private chat: first name, last name, age, city, and configured custom questions. The participant reviews the complete form and confirms it before a place is reserved.

The reservation transaction locks the form, checks the global capacity and city quota, and then confirms the entry. This prevents oversubscription when several people confirm simultaneously. A participant can cancel from **Registration → My registrations**, immediately returning the place to the available pool.

## Privacy and operations

- Names, custom answers, and in-progress form data are encrypted with `APP_PRIVACY_SECRET`.
- Telegram user IDs remain stored for duplicate prevention and self-service cancellation.
- Registration records are scoped to the church group that created the form.
- Configure `TELEGRAM_BOT_USERNAME` so published buttons can use `https://t.me/<bot>?start=reg_<ID>`.
- Never change `APP_PRIVACY_SECRET` without a data-migration plan; existing encrypted registration data would become unreadable.
