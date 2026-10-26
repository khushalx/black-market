# Multiplayer implementation

BLACK MARKET uses Colyseus 0.18, its official TypeScript SDK, Node.js, and PostgreSQL with Drizzle. It is implemented and runs locally. This replaces the previous integration proposal.

## Authority and privacy

A transport-independent Auction processes commands serially. The server supplies the UTC clock, selects asset scenarios before bidding, validates readiness and bids, tracks a single close timestamp, and deducts each winning payment once. Bids carry the lot number and a unique request ID; delayed, duplicate, fractional, over-budget, self-leading and closed bids are rejected.

Public snapshots contain product references, accepted bids, wallets and connection states. They exclude private scenario appraisals until final results. Each connection receives its own inspection and dealer offer through a separate private message. Two inspections reveal truthful scenario facts and an indicative interval. Clients cannot submit financial outcomes, appraisals or career balances.

Guest identities use hashed opaque session tokens in HttpOnly cookies. A signed, short-lived ticket binds a room seat to the authenticated profile. The server rejects forged tickets, a second active seat for the same identity, unauthorized ranked seats and ordinary joins after start. A reconnection retains the original identity, wallet and obligations.

## Room lifecycle

- Friends rooms have a six-character code and shareable URL, public/private visibility, custom equal budgets and timings, and opt-in labeled bots.
- Ranked rooms are created by the internal queue, have server-derived tier budgets and contain real connected humans only.
- Every collector readies up. Ranked rooms start automatically when all assigned seats are ready. After 45 seconds, two or more ready connected humans can start without absent/unready invitees; otherwise the table closes and players can queue again.
- A dropped socket gets a 60-second Colyseus reservation. The SDK reconnects; reload recovery uses its reserved session token from sessionStorage. Financial actions are not queued while disconnected.
- A disconnected collector's accepted winning bid still settles. Hosting transfers to a remaining connected human. Expired/consented departures retain their financial record and are omitted when the next rematch opens.
- Final online results are saved transactionally. Failures show a retrying state. A private rematch waits for saved results, resets wallets and inspections, and requires readiness again.

## Queue and progression

The server derives bankroll tier and rating from PostgreSQL. It prefers 3–6 compatible people, permits two after ten seconds, and widens rating tolerance by 100 every fifteen seconds from 150 to 600. Tiers never mix, so starting cash is equal. Queue polls expire after fifteen seconds without a heartbeat.

Starter cash is $5,000, Collector $15,000 and High Roller $50,000. Career cash, match cash and skill rating are separate. See [persistence](docs/PERSISTENCE.md) for formulas, atomic/idempotent settlement, recovery and anti-farming limits.

## Running and deployment

`npm run dev` launches the local database, server and web app. API requests are proxied through Next.js; Colyseus uses its persistent WebSocket endpoint directly. For production deploy a long-running Node service with WebSocket upgrade support, PostgreSQL and Next.js. Supply a strong SESSION_SECRET, DATABASE_URL, APP_ORIGIN and browser-visible NEXT_PUBLIC_WS_URL. HTTPS pages need HTTPS/WSS endpoints.

This is a single-process backend. Queue, rate limits and active-seat reservations are process-local. Horizontal scaling needs shared presence/driver, distributed seat and queue coordination, persistent abuse rate limits and operational monitoring. Server restart interrupts active matches; only completed persisted history survives. No public deployment or physical multi-device test is claimed.

References: [official server documentation](https://docs.colyseus.io/server), [official React integration](https://docs.colyseus.io/getting-started/react), [official reconnection documentation](https://docs.colyseus.io/room/reconnection).

The backend audit additionally enforces collision-free active room codes, reserved ranked seats, cancellation, HTTP/WebSocket origin checks, bounded action limits, production configuration validation, database readiness checks and completed-result shutdown writes. Unattended running matches finish and save before their empty room is disposed. Countdown rendering uses a measured server clock offset. See [deployment](docs/BACKEND-DEPLOYMENT.md).
