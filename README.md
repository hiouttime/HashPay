# HashPay Workers

HashPay v1 runs on Cloudflare Workers with Vite, Vue 3, Hono, D1, Queues, and Cron Triggers.

<!-- dash-content-start -->

HashPay is a crypto payment gateway for Cloudflare Workers. It provides a Vue admin console, merchant order APIs, a hosted checkout page, Telegram bot and Mini App login, chain payment checks, D1 persistence, queue-backed merchant notifications, and scheduled jobs for expiry, rate sync, and payment verification.

Key Cloudflare features used by this project:

- Workers and Hono for the backend API and Telegram webhook.
- Worker Assets for the Vue admin and checkout frontend.
- D1 for configuration, merchants, payment channels, orders, notifications, and review records.
- Queues for asynchronous merchant callbacks.
- Cron Triggers for periodic order expiry, payment checking, and rate synchronization.

<!-- dash-content-end -->

## Cloudflare Git Import

When importing this repository from Cloudflare Workers Builds, use these settings:

| Field | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | leave empty unless this project is inside a monorepo |
| Build command | leave empty; `wrangler.jsonc` runs `npm run build` before deploy |
| Deploy command | `npm run deploy` |
| Non-production branch deploy command | `npm run deploy:preview` |

Runtime secrets must be configured in **Settings > Variables & Secrets**:

| Name | Type |
| --- | --- |
| `TGBOT_TOKEN` | Secret |
| `APP_SECRET` | Secret |

The same binding and secret descriptions are also declared in `package.json` under the `cloudflare.bindings` object for Cloudflare import surfaces that read package metadata.

Required bindings are declared in `wrangler.jsonc`:

| Binding | Resource |
| --- | --- |
| `DB` | D1 database `hashpay` |
| `QUEUE_NOTIFY` | Queue `hashpay-notify` |
| `ASSETS` | Worker assets from `dist` |

D1 migrations are configured at `src/server/db/d1/migrations`. HashPay also runs schema initialization inside the Worker startup path, but a production install can apply migrations explicitly:

```sh
npm run db:migrate:remote
```

## Local Development

Create local secrets:

```sh
cp .dev.vars.example .dev.vars
```

Then fill `TGBOT_TOKEN` and `APP_SECRET`.

Run the Vite app:

```sh
npm run dev
```

Run the Worker runtime locally:

```sh
npm run dev:worker
```

## Cron

The Worker defines `scheduled()` in `src/index.ts`, and `wrangler.jsonc` configures a one-minute Cron Trigger:

```jsonc
{
  "triggers": {
    "crons": ["* * * * *"]
  }
}
```

Local cron testing:

```sh
npm run cron:test
curl "http://localhost:8787/cdn-cgi/handler/scheduled?format=json"
```

A successful local call returns an `ok` outcome. After deployment, Cloudflare Cron Trigger changes can take several minutes to propagate.
