# Deployment

The reference production target is one Docker host behind an HTTPS reverse proxy.

1. Install Docker with Compose and clone the repository.
2. Create `.env` from `.env.example`. Set unique `POSTGRES_PASSWORD`, `APP_PRIVACY_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, Telegram, Gemini, and Groq keys, `APP_ENV=production`, and `TELEGRAM_UPDATE_MODE=webhook`.
3. Run `docker compose -f compose.yaml -f compose.production.yaml up -d --build`.
4. Route public HTTPS `/webhooks/telegram` to port 3000 and set `TELEGRAM_WEBHOOK_URL` to that URL.
5. Run `npm run telegram:setup` from a trusted machine with the same `.env`.
6. Verify `/health`, `/ready`, Telegram `/status`, and container logs.

Deploy updates with `git pull` followed by the same Compose command. Prisma migrations run before the application starts. Keep port 3000 private behind the reverse proxy when possible.
