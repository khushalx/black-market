# BLACK MARKET

A multiplayer auction game about real objects and fictional US dollars. Buy below appraised game value, preserve cash for later lots, and finish with the most wealth. No real payments, withdrawals, cash prizes or paid top-ups.

## Run locally

Requires Node.js 22.13+, npm and a running Docker Desktop engine:

```sh
npm install
npm run dev
```

Open **http://localhost:3000**. The launcher starts PostgreSQL 17 through Docker Compose on `127.0.0.1:54329`, the Colyseus/API server on `2567`, and Next.js on `3000`. PostgreSQL uses the persistent `blackmarket_pg` Compose volume; startup initializes the schema. The database stays running after the web/backend launcher exits. Use `npm run db:stop` to stop it without removing data.

For separate terminals, run `npm run db:dev`, `npm run db:migrate`, `npm run server` and `npm run dev:web`. Backend scripts and Next.js load `.env.local` with the same precedence; exported variables take priority. Set `DATABASE_URL` for another PostgreSQL instance (Neon for public deployment). See [Docker setup and existing-data transition](docs/LOCAL-DOCKER.md) before replacing a previous embedded database. Do not run both database runtimes on port 54329.

For two independent identities on this computer, use `localhost:3000` and `127.0.0.1:3000`, or separate browser profiles. Ordinary tabs on the same hostname share an identity. LAN play needs the exact frontend origins in `APP_ORIGIN`, a reachable `NEXT_PUBLIC_WS_URL`, and the frontend hostname in Next's `allowedDevOrigins`. Restart after configuration changes.

## Play

- **Friends:** choose a nickname, create a room, share its six-character code and ready up. The host starts when everyone is ready. Choose 2–6 seats, 4/8/12 lots, equal match cash, visibility, timings and optional explicitly labeled bots.
- **Ranked:** enter the public queue. The server selects compatible career tiers and widens rating tolerance over time. It prefers 3–6 people and allows two after ten seconds. Ranked rooms never add bots.
- **Practice:** local, labeled bots use the same auction rules. No account, persistence or ranked rewards.
- **Recovery:** save the private key shown at guest creation. It restores your profile on another browser and rotates the key. A nickname is not an authentication credential.

Public matches default to eight lots, $5,000 each in Starter, ten-second previews, thirty-second auctions and three-second transitions. Two truthful private inspections are free. Late bids add five seconds at most three times. At selected previews, an optional dealer offer pays 88% of an owned item's appraisal for liquidity.

Final wealth is remaining cash plus appraised value of held items. Dealer-sold items are excluded from held wealth. Final receipts explain valuation factors and purchase returns. Friends rooms support rematches with fresh wallets. PostgreSQL saves online history; only eligible ranked matches change career progression.

## Architecture

| Location | Responsibility |
| --- | --- |
| `src/domain/auction.ts` | Serial auction rules, deadlines, bids, inspections, dealers and scoring |
| `src/catalog/` | 209 real collectible models, price provenance and reproducible valuation scenarios |
| `src/shared/market.ts` | Public/private contracts and transport interface |
| `src/client/market-client.ts` | Colyseus SDK, reconnection, HTTP API and offline adapter |
| `server/room.ts` | Authenticated rooms and owner-only private messages |
| `server/index.ts`, `matchmaking.ts` | Identities, queue, tier/rating compatibility and discovery |
| `server/persistence.ts`, `schema.ts`, `progression.ts` | PostgreSQL/Drizzle transactions, history, sessions, career and Elo |
| `src/app/market-components/` | Compact auction, collection, drawers and results |

The server owns clocks, wallets, hidden asset scenarios and outcomes. Clients submit intentions. Confidential appraisals stay out of public snapshots until final settlement. Accepted bids remain binding after disconnect. Dropped sessions are reserved for 60 seconds; a page reload can recover that seat during the window.

## Checks

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run test:db       # PostgreSQL required
npm run test:online   # Colyseus + PostgreSQL; four independent live SDK clients
npm run test:queue    # Colyseus + PostgreSQL; three real queue participants
```

Default tests skip suites needing services. Integration tests create unique local test profiles/results and retain them. Browser QA uses two independent local-origin sessions. Physical multi-device testing has not been performed. See [verification](docs/QA.md).

## Data and deployment limits

- Most price baselines are **curated game estimates**, not live quotes or invented completed sales. Documented asking-price medians and official retail anchors are distinguished. See [catalog and photo rights](docs/CATALOG.md).
- Guest-only anti-farming uses device identity, creation limits and repeated-opponent caps. Competitive public launch needs monitored abuse controls and verified account upgrades.
- Queue and active-seat registry are single-process. Use one persistent Node/WebSocket server. Multiple processes need shared matchmaking/presence and coordinated identity reservations.
- Internet play requires deploying Next.js, a persistent Colyseus Node server and PostgreSQL; configure HTTPS/WSS, exact origins, strong `SESSION_SECRET`, database credentials/TLS and backups. This build has not been publicly deployed.

See [multiplayer](COLYSEUS_INTEGRATION.md), [persistence](docs/PERSISTENCE.md), and [visual direction](ART_DIRECTION.md).

Backend setup, required environment variables, migrations, shutdown and deployment: [backend deployment](docs/BACKEND-DEPLOYMENT.md).
