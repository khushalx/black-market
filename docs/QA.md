# Rebuild verification — 26 October 2026

This report applies to the real-object Colyseus/PostgreSQL rebuild. Earlier fictional-item QA was archived in `.local/legacy-prototype.tar.gz`; old screenshots outside `screenshots/rebuild/` are historical.

## Automated checks

- Default rule/catalog/progression tests: **18 passed**; four service-dependent tests deliberately skipped.
- PostgreSQL suite: **7 passed**, including authenticated identity recovery, hash-only credentials, duplicate/concurrent settlement, repeated-opponent cap, history, single-credit recovery and tied ranks.
- Four independent live Colyseus SDK clients: **passed**, playing all eight lots and a full eight-lot rematch. Checked real concurrent bids, one accepted tie by server order, insufficient funds, sealed appraisals, owner-only inspections, unauthorized ticket rejection, active-match join rejection, a genuine WebSocket drop/reconnection, authoritative cash/scoring, persistence and fresh rematch wallets.
- Public matchmaking suite: **2 passed**. Three real server-authenticated participants received equal Starter wallets despite forged tier/balance/rating input, completed eight ranked lots, and received exactly one career update. A second allocation omitted the assigned host; after the 45-second ready window, two ready humans started with no bots.
- Twelve seeded offline bot matches completed with legal wallets, distinct catalog lots and correct final receipts.
- Lint, TypeScript and optimized Next.js production build pass.

Live integration checks used documented server timing overrides (3-second preview, 6-second auction, 2-second transition) to shorten execution. Private browser settings were 5/12/3. The running development server was restored to normal ranked defaults: **10/30/3**, eight lots.

## Browser playthrough

Two independent first-party identities were tested in the in-app browser: `localhost:3000` (Avery) and `127.0.0.1:3000` (Blake). They share one computer, with separate host cookies. This is separate-session testing, **not physical multi-device testing**.

Created an eight-lot private room, joined through its real code, readied both collectors and started through the host. Both sessions placed live bids. Avery's inspection was absent from Blake's view. References displayed explicitly curated pricing; appraisals stayed sealed. An expired dealer offer was rejected without changing cash.

Both sessions reached the same saved outcome: Blake **$5,438 = $4,850 cash + $588 assets**, Avery **$5,253 = $4,950 cash + $303 assets**. The history receipt matched. Rematch returned both to an eight-lot lobby with $5,000 each and readiness cleared. PostgreSQL retained those receipts across server restarts.

Started offline practice with five clearly identified bots and default eight-lot settings. Bots bid and purchases settled locally. Inspected browser console errors after the flow: none.

## Responsive and accessibility checks

Visually inspected 360×780, 390×844, 430×932, 768×1024, the normal desktop viewport and 1366×900. DOM measurements showed no horizontal page overflow at the tested mobile/tablet widths. The mobile wallet and bid dock remained in the viewport; 360px still showed the price, clock and bid action together. Native modal focus/close behavior and the mobile history dialog were checked. Icon-only History and Rules controls have explicit accessible names. Dialog centering was corrected after visual review. New lots clear stale item drawers and reset custom bids.

Screenshots:
- [Desktop auction](screenshots/rebuild/auction-1366.png)
- [Mobile auction](screenshots/rebuild/auction-360.png)
- [Saved final settlement](screenshots/rebuild/results-desktop.png)

## Local setup and limits

Verified `npm run dev` starts PostgreSQL (or reuses the compatible local instance), waits for an authenticated SQL query, starts Colyseus, waits for its health endpoint, then starts Next.js. A fresh isolated PostgreSQL cluster was also tested during persistence work.

Not verified: physical phones/devices, internet latency, public deployment, large load, multi-process operation or long-duration production abuse resistance. Active matches and queue reservations are process-local; completed history is durable. Most prices are curated game estimates, with documented source status. See README for deployment configuration and guest-identity limitations.
