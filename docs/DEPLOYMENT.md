# Deployment

The reference production target is one Docker host behind an HTTPS reverse proxy.

1. Install Docker with Compose and clone the repository.
2. Create `.env` from `.env.example`. Set unique `POSTGRES_PASSWORD`, `APP_PRIVACY_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, Telegram, Gemini, and Groq keys, `APP_ENV=production`, and `TELEGRAM_UPDATE_MODE=webhook`.
3. Run `docker compose -f compose.yaml -f compose.production.yaml up -d --build`.
4. Route public HTTPS `/webhooks/telegram` to port 3000 and set `TELEGRAM_WEBHOOK_URL` to that URL.
5. Run `npm run telegram:setup` from a trusted machine with the same `.env`.
6. Verify `/health`, `/ready`, Telegram `/status`, and container logs.

The provided Docker image includes `ffmpeg`, which is required for sermon normalization and segmentation. A non-Docker installation must provide `ffmpeg` on `PATH`.

Deploy updates with `git pull` followed by the same Compose command. Prisma migrations run before the application starts. Keep port 3000 private behind the reverse proxy when possible.

## Raspberry Pi Polling Deployment

For an ARM64 Raspberry Pi without a public domain, use `compose.raspberrypi.yaml`. It runs production polling, PostgreSQL, migrations, and persistent sermon storage without publishing application or database ports to the LAN.

1. Set production secrets in `.env`, including a unique `POSTGRES_PASSWORD` and `APP_PRIVACY_SECRET`.
2. Run `docker compose -f compose.raspberrypi.yaml up -d --build`.
3. Verify `docker compose -f compose.raspberrypi.yaml ps` and the internal `/ready` health check.
4. Do not run another polling instance with the same Telegram token.

Both containers use `restart: unless-stopped` and return after a Raspberry Pi reboot when Docker is enabled.
