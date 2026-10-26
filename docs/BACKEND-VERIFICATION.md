# Backend verification — 26 October 2026

The existing shared game rules, catalog and visual design were preserved. The backend was audited against current Colyseus 0.18 documentation and exercised through real independent SDK connections, PostgreSQL and the existing browser UI.

## Completed checks

- `npm test`: **29 passed**, six service-dependent cases intentionally skipped by default.
- `npm run test:db`: **7 passed**, including the database case for concurrent duplicate settlement, atomic progression, session forgery, recovery rotation, hash-only credentials, farming caps and concurrent bankroll recovery.
- `npm run test:online`: **3 passed**. Four clients completed eight lots plus a full rematch (about 182 seconds). Two independently authenticated HTTP guests completed the exact $200/$250 bidding scenario, winner-only debit, next lot, reload reconnection, identical final totals and persisted history. A separate abandoned match completed and saved after both clients left; its participants could not create another room before settlement.
- `QUEUE_TEST=1 TEST_SERVER=http://127.0.0.1:2568 node --import tsx --test tests/queue-online-v2.test.ts`: **2 passed**. Three genuine clients used server-derived tiers, equal wallets and exactly-once ranked progression. Reserved players could not open another room. A cancelled reservation was refused without destroying the table; the other two people started after the ready-up window despite the absent assigned host.
- Queue verification used an isolated server with configured 3/6/2-second timings to keep the test bounded. The normal app retained ranked defaults of **10/30/3 seconds**, eight lots and $5,000 Starter cash.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run db:migrate`: passed.
- A separate process booted with production configuration, answered the PostgreSQL-backed readiness check, received SIGTERM and exited cleanly with code 0. This verifies startup/shutdown locally, not public HTTPS hosting.
- `npm audit` and `npm audit --omit=dev`: **zero vulnerabilities** after replacing the unused bundled Colyseus integrations with its official core and WebSocket transport packages.
- Browser smoke: practice entered preview with its existing labeled bots; the real private-room UI displayed an independently connected SDK player and synchronized ready status. The disposable browser account signed out after verification. Evidence: `docs/screenshots/backend/real-private-room.jpg`.
- Seventeen protected visual/catalog source files matched their pre-audit SHA-256 baseline. `room-view.tsx` changed only countdown time sourcing and the result-save/profile-refresh dependency; no markup, layout, colors or type changes.

Across the default suite and separately enabled integration cases, all **35 distinct tests** were exercised successfully. The six pure progression tests also run again as part of `test:db`.

## Bugs fixed during verification

The cancellation regression initially exposed automatic room disposal after a rejected first join. Ranked tables now survive that rejection until their explicit ready-up deadline. Running unattended auctions retain their participants' commitments and save before disposal. Reserved reconnecting players remain attached to their original room until reconnection or final expiry. Private lobby disposal resumes correctly after a rematch.

## Limits

This is local verification, including independent SDK clients; it does not claim real physical devices, WAN conditions, public hosting, production load or crash-durable active auctions. Active rooms, queue/seat coordination and rate limits require a single backend process. Completed history is PostgreSQL-backed. No paid service or deployment was created. See `BACKEND-DEPLOYMENT.md` for environment variables, migrations, operational requirements and scaling work.
