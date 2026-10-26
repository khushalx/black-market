# Run and deploy BLACK MARKET

## Local development

Use Node.js 24 LTS and `npm ci`, then `npm run dev`. The launcher starts the persistent local PostgreSQL cluster on loopback 54329, the Colyseus service on 2567, and Next.js on 3000. Open http://localhost:3000. The separate commands are `npm run db:dev`, `npm run server`, and `npm run dev:web`. Alternatively start PostgreSQL with `docker compose up -d postgres`; do not start both databases on the same port.

`cp .env.example .env` is optional for the default local setup. Replace its placeholder SESSION_SECRET for production. Keep `.env` files out of source control. Local database files and test records live under `.local/`; integration tests retain uniquely named records without deleting user data.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Backend | PostgreSQL connection URL; required in production. Use the provider's verified TLS configuration, for example `sslmode=verify-full`, and its CA if needed. |
| `SESSION_SECRET` | Backend | Random persistent secret of at least 32 characters. Required in production; never expose through a NEXT_PUBLIC variable. |
| `APP_ORIGIN` | Backend | Comma-separated exact frontend origins, without trailing slashes. Production requires HTTPS. HTTP and WebSocket handshakes reject unlisted browser origins. |
| `PORT` | Backend | Listening port; default 2567. |
| `TRUST_PROXY_HOPS` | Backend | Exact number of trusted reverse-proxy hops, default 0. Set 1 only when all traffic comes through one trusted proxy; block direct access to that listener. Used for HTTP abuse limits. |
| `NEXT_PUBLIC_WS_URL` | Web, at build time | Public Colyseus endpoint, e.g. `https://game-api.example.com`; the official SDK uses WSS for HTTPS endpoints. |
| `API_ORIGIN` | Web, at build time | Backend HTTP endpoint for the `/api/*` rewrite, e.g. `https://game-api.example.com`. Keep API cookies on the frontend origin through this proxy. |
| `NODE_ENV` | Both | Set `production` in deployment. Backend validates required configuration before listening. |
| `RANKED_PREVIEW_SECONDS`, `RANKED_AUCTION_SECONDS`, `RANKED_RESULT_SECONDS` | Backend, optional | Server-controlled durations. Defaults 10/30/3; validated limits 3–30 / 5–90 / 2–15. |

Generate a secret with `node -e 'console.log(require("node:crypto").randomBytes(48).toString("hex"))'` and save it only in your host's secret manager. Do not use the example placeholder.

## Database migration

Run `npm run db:migrate` against the configured database before starting the backend. It runs the idempotent initial schema in `server/schema.ts`; server startup also awaits this migration. It preserves existing profiles, sessions and completed matches. Future schema changes must be separate ordered migrations, not edits to existing table definitions. Grant only the application database user access; never expose PostgreSQL publicly. For a stricter production role, run migrations with a migration role, then use a restricted runtime role and adapt startup migration permissions accordingly.

Full revealed receipts, winning purchase prices, appraisals, participant ranks, match budgets and timestamps are stored in PostgreSQL. Profile and career-ledger changes share the same transaction as the unique match ID. Duplicate settlement does not award rewards twice. Back up the database and verify restores before public use.

## Persistent backend and web hosting

Deploy exactly **one** always-on Node service with WebSocket upgrade support. Install with `npm ci --omit=dev`; tsx is a runtime dependency. Supply the backend environment variables and run `npm run server`. Terminate HTTPS/WSS at the hosting platform or reverse proxy and forward upgrades to PORT. Do not put the Colyseus process inside a Next.js serverless function. Configure `/health` as a readiness check: it returns 200 only when PostgreSQL answers a query, otherwise 503. Give SIGTERM a shutdown grace period of at least 30 seconds so in-flight completed-result writes can finish. The backend clears matchmaking timers, disposes rooms and closes its database pool through Colyseus shutdown hooks.

Build the frontend with `npm ci` and `npm run build`, supplying NEXT_PUBLIC_WS_URL and API_ORIGIN at build time. Run it with `npm start` or deploy the Next.js frontend to Vercel. Keep the same frontend origin in APP_ORIGIN. HTTPS frontend and backend certificates must be valid; test WebSocket upgrades, cookie-based `/api/me`, invites and refresh reconnection on the deployed domains before opening access.

No deployment, paid service, or external infrastructure has been created by this implementation.

## Phase 1 limits and disconnection policy

The queue, active/reserved seat registry, rate limits, six-character room-code allocation and live auctions are process-local. Do not run multiple backend instances. A dropped client has a 60-second reserved reconnection window; the original wallet, bids, inventory and private inspection remain attached to that seat. The SDK retries automatically, and a page reload restores the reserved token from sessionStorage. Consent-based leave is final for that match.

An accepted bid remains binding after a disconnect or leave. A running process finishes even an unattended match and saves its result, then disposes the empty room. An unfinished participant cannot enter another room until the current result has saved. Lobby hosting transfers to another connected human. Private rematches wait for persistence and reset only match wallets and inspections.

Active auctions are not crash-durable: server crashes, forced termination or deployment restart interrupt unfinished matches. They award no career progression. Completed matches are durable and idempotent. Plan maintenance between matches; a future durable active-match journal is required before claiming crash recovery.

Ranked matchmaking prefers 3–6 real people and allows two after ten seconds for a small population. It never mixes tiers or inserts bots. Cancelled/expired reservations cannot join a ranked table. If assigned people do not all ready up, a 45-second ready window starts with at least two ready connected humans or closes the table. Practice and friends rooms never generate ranked rewards. Guest-device and repeat-opponent checks reduce farming but do not prove distinct humans; verified account upgrades and monitored abuse controls are needed for competitive public release.

For multiple processes later, introduce RedisPresence and RedisDriver, plus shared atomic queue/seat reservations, distributed rate limits and coordinated room-code allocation. Merely adding another Node instance would allow duplicate seats and conflicting queues. Load tests, monitoring, alerting and real-device/internet testing remain deployment work.

Official references: [rooms](https://docs.colyseus.io/room), [reconnection](https://docs.colyseus.io/room/reconnection), [QueueRoom](https://docs.colyseus.io/matchmaker/queue), [authentication](https://docs.colyseus.io/auth/room), [deployment](https://docs.colyseus.io/deployment).
