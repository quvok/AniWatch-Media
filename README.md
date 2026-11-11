# AniWatch Media

A private editorial dashboard for the public Telegram channel `@aniwatch_1`.

## Current scope

- Telegram post editor with bold, italic, strikethrough, monospace and links.
- Text, public HTTPS image and public HTTPS video publishing.
- Up to 6 inline URL buttons and Telegram preview.
- Browser-local drafts with edit/delete.
- Local editorial calendar with idea, draft and ready states (not a publishing scheduler).
- Manual publication only, with confirmation before every send.
- Local publication history and JSON export.
- Channel subscriber count via Telegram Bot API, with browser-local historical snapshots.
- Russian-language AI assistant for post generation, ideas, rewriting and a 7-day content plan.
- No database, no scheduled publishing, no Cron Trigger and no automatic posting.

**Important limitations:** drafts, publication history and subscriber snapshots live in the current browser only; they are not synced between devices. Telegram Bot API exposes the current channel member count but does not provide full post-level views/reactions analytics. This dashboard does not fabricate post views or engagement rates. Detailed Telegram channel statistics require an eligible channel and an authorized MTProto user session.

## Architecture

- GitHub Pages hosts `index.html`.
- Cloudflare Worker in `worker/worker.js` holds Telegram credentials and serves the authenticated API.
- Telegram Bot API publishes text, photos and videos.
- Cloudflare Workers AI powers the assistant through an `AI` binding. No OpenAI API key is used.
- Browser localStorage stores drafts, editorial plan, publication history and subscriber snapshots.

## 1. Configure the Telegram bot

1. Create a bot using Telegram's official `@BotFather`.
2. Add the bot as an administrator of `@aniwatch_1`.
3. Grant the permission required to post messages.
4. Keep the bot token private. Never place it in this repository or in the browser.

## 2. Configure the Cloudflare Worker

Deploy the contents of `worker/worker.js` to the existing Worker.

### Variables and secrets

| Name | Type | Value |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Secret | Token from BotFather |
| `ADMIN_KEY` | Secret | Unique random value, at least 32 characters |
| `TELEGRAM_CHANNEL_ID` | Variable | `@aniwatch_1` |
| `ALLOWED_ORIGIN` | Variable | Exact Pages origin, e.g. `https://quvok.github.io` |
| `AI_MODEL` | Variable, optional | Defaults to `@cf/zai-org/glm-4.7-flash` |

Do not send secrets in chat, commit them, or put them in frontend code.

### Enable Workers AI

The AI assistant requires a Cloudflare Workers AI binding:

1. Open the Worker in Cloudflare Dashboard.
2. Open **Settings → Bindings**.
3. Add a **Workers AI** binding.
4. Set the variable name to exactly `AI`.
5. Save and deploy the Worker.

The Worker calls `env.AI.run()`; no OpenAI key or other provider key is required. Workers AI usage is subject to Cloudflare account limits and pricing. See the [Cloudflare Workers AI bindings guide](https://developers.cloudflare.com/workers-ai/configuration/bindings/).

### Verify the Worker

Open `https://YOUR-WORKER.workers.dev/health`. It should return JSON with `"ok":true` and list enabled features.

The authenticated endpoints are:

- `GET /health` — public health check.
- `POST /publish` — publish text, photo or video.
- `GET /analytics` — current channel member count from Telegram.
- `POST /ai` — generate text with Workers AI.

All endpoints except `/health` require `Authorization: Bearer ADMIN_KEY`. CORS is restricted to `ALLOWED_ORIGIN`.

## 3. Enable GitHub Pages

1. Open repository Settings → Pages.
2. Under Build and deployment, choose **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` deploys the static dashboard after a push to `main`.
4. Wait for the Pages workflow to complete, then open the published URL.

## 4. Use the dashboard

1. Enter the Worker URL in **Адрес Worker API**.
2. Enter the `ADMIN_KEY` in **Ключ доступа панели**. It is kept in the current tab's session memory.
3. Use **Редактор** to compose and publish posts. Image and video are mutually exclusive.
4. Use **Аналитика → Обновить статистику** to fetch the current subscriber count. Take periodic snapshots from the same browser to build a trend.
5. Use **Контент-план** to organize ideas by date and status without scheduling Telegram sends. Use **ИИ-ассистент** to generate posts, ideas, rewrites or a weekly content plan. Provide source facts when factual accuracy matters.

Every Telegram send remains a manual action with a browser confirmation. The assistant never publishes directly.

## Analytics data boundaries

The dashboard can reliably show:
- Current subscriber count from Telegram.
- Change between locally recorded subscriber snapshots.
- Number and history of posts sent through this dashboard.

It cannot reliably show per-post views, reactions, shares, reach or channel-wide growth history from before the first local snapshot. Telegram documents detailed broadcast statistics through MTProto's `stats.getBroadcastStats`, which is not part of the Bot API and is available only to eligible channel administrators. See [Telegram channel statistics](https://core.telegram.org/api/stats).

## Local data and privacy

- Drafts, editorial plan, history and subscriber snapshots are stored in this browser's localStorage.
- Use **Экспортировать историю и замеры** to back up analytics as JSON.
- Clearing browser storage removes local data.
- The Worker does not store drafts or analytics history.
- Anyone who obtains the admin key can publish to the channel. Rotate it immediately if exposed.

## Not included by design

- Scheduled/automatic publishing and queue: disabled per current project decision.
- Database and cross-device sync: not enabled.
- Full post-level Telegram statistics: requires a separate MTProto integration and eligible channel access.
- Multi-user accounts, approvals and comments inbox.
