# Changelog

## Unreleased

- Redesigned daily devotionals for concise mobile reading with spaced sections, restrained visual markers, and stricter AI length limits.
- Added topic-aware devotional images through Cloudflare Workers AI with OpenRouter fallback and text-only delivery when image generation fails.
- Added a durable group-scoped administrator audit log and `/activity` command.
- Added privacy-safe operational failure totals without exposing member or sermon content.
- Recorded successful event, sermon moderation, digest, announcement, role, and prayer-request mutations.
- Added configurable retention for sermon audio, transcripts, and private prayer requests.
- Added administrator-only dry-run and explicitly confirmed, idempotent cleanup commands.
- Added an optional application-level outbound HTTP proxy and an isolated Xray sidecar for Raspberry Pi deployments.
- Deployed and verified Telegram polling through the isolated Raspberry Pi VPN route.
- Added automatic Gemini-to-Groq fallback for Bible answers and sermon content generation.
- Added natural private AI chat without slash commands; ordinary group conversation remains untouched.
- Added automatic private audio and voice-message transcription with transcript delivery in chat.
- Added optional archive-grounded AI answers, moderated announcements, and private prayer requests.
- Added bounded timeouts and privacy-safe diagnostics for Telegram, Gemini, Groq, and transcription requests.
- Corrected retention age calculation to use actual storage and transcription timestamps.
- Added a durable retry queue for physical audio-file deletion.
- Prevented integration tests from running destructive cleanup against a non-test database.
- Hardened Telegram HTML truncation and removed duplicate escaping implementations.
- Added exponential retry delays and stale-job diagnostics to prayer-request publication.
- Added encrypted, user-scoped AI conversation memory with a 30-day expiry and `/new_chat` deletion command.
- Added public video-platform audio extraction for sermon links with `yt-dlp`, proxy routing, host allowlisting, playlist blocking, and size limits.
- Added standalone-link intake and 6–12 AI follow-up drafts scheduled at three collision-free group slots per day after administrator approval.
- Added six-character public sermon IDs across intake, status, notifications, archive search, and regeneration while retaining compatibility with existing internal IDs.

## 0.2.0 - 2026-09-14

- Added an inline administrator dashboard and persistent guided event creation.
- Added durable private sermon progress notifications.
- Added audited draft editing, rejection, approval, and safe AI regeneration.
- Added moderated weekly digests with durable delivery.
- Added event RSVP buttons with private per-user choices and aggregate counts.
- Added group-scoped sermon transcript search with sourced excerpts.
