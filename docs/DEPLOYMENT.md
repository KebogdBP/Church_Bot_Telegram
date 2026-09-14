# Deployment

## Raspberry Pi isolated VPN routing

`compose.raspberrypi.yaml` runs Xray as a sidecar HTTP proxy. Only the bot application's outbound HTTP requests use `OUTBOUND_PROXY_URL=http://vpn:10809`; PostgreSQL, Nginx, SSH, and other host services keep their normal network route.

Create `deploy/xray/config.json` from `deploy/xray/config.example.json` directly on the server. The real file is ignored by Git and must have mode `600`. Never commit or log the VLESS UUID, REALITY public key, or short ID.

Verify the proxy before starting the app:

```sh
docker compose -f compose.raspberrypi.yaml up -d vpn
docker run --rm --network telegram-church-bot_default curlimages/curl:8.10.1 \
  -x http://vpn:10809 -I --max-time 20 https://api.telegram.org
```

Then start the stack and inspect health and polling logs:

```sh
docker compose -f compose.raspberrypi.yaml up -d --build
docker compose -f compose.raspberrypi.yaml ps
docker compose -f compose.raspberrypi.yaml logs --tail=100 app vpn
```

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
