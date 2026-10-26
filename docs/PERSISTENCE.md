# Profiles, wallets and PostgreSQL

The game uses PostgreSQL through Drizzle's node-postgres driver. `server/schema.ts` contains the schema and the idempotent initial migration. Startup must await `initPersistence()` before accepting authenticated traffic; there is no silent in-memory fallback for online progression.

## Local database

Docker Compose is the standard local database runtime:

- `npm run db:dev` starts PostgreSQL 17 through `docker compose up -d --wait postgres`. The persistent named volume survives service restarts. `npm run db:stop` stops the container without removing data.
- `npm run db:embedded` retains the previous embedded runtime for explicit maintenance or isolated tests. Its cluster is in ignored `.local/postgres`; it is never started as a fallback by `npm run dev`. Do not run both on the same port. See [transition instructions](LOCAL-DOCKER.md) to preserve existing embedded data.

For an isolated embedded verification cluster, set `LOCAL_DB_PORT` and `LOCAL_DB_DIRECTORY` when starting `db:embedded`, and point `DATABASE_URL` at that port when running tests. Startup verifies an authenticated SQL query as well as the package's log readiness signal. An already running compatible instance is reused without taking ownership of its shutdown.

The development URL is `postgres://blackmarket:blackmarket@127.0.0.1:54329/blackmarket`. Set `DATABASE_URL` in `.env.local` for other installations. `npm run db:migrate` loads that configuration and initializes schema explicitly; server startup does the same. Public deployment will use Neon PostgreSQL with provider-issued credentials and TLS. No Neon resource or deployment has been created. The provided development credentials are not suitable for deployment.

## Identity and recovery

The server generates profile IDs, 256-bit session tokens and 160-bit recovery codes. Only SHA-256 digests of tokens and recovery codes are stored. A nickname is a display label, never an authentication credential. Sessions expire after 30 days. The HTTP layer places tokens in HttpOnly, SameSite cookies and issues short-lived signed room tickets.

Recovery is an account recovery/upgrade path without a signup wall. Save the recovery code shown at creation; possession restores that profile on another browser. Recovery revokes every previous session and rotates both session and recovery secrets. The rotated recovery code is displayed once. Treat it as a password. It is not an email/password account or an externally verified identity.

## Three separate balances

1. **Career bankroll** starts at $5,000 and controls eligibility: Starter below $7,500, Collector from $7,500 to below $25,000, High Roller from $25,000.
2. **Match cash** is equal for every participant: Starter $5,000, Collector $15,000, High Roller $50,000. Career cash is not wagered or spent to enter.
3. **Skill rating** begins at 1,000. It is pairwise Elo, K=24 averaged across opponents, with tied wealth treated as a draw. Rating is bounded to 100–3,000.

Equal final wealth shares the same rank and first-place win credit; Elo treats it as a draw. Only eligible ranked results change career progression. Private and practice matches can be recorded for history but never grant career money, ranked wins or rating.

Career adjustment is `round(500 × match profit / starting match cash)`, capped to −$500…+$500. A 20% return earns $100. Career cash has a $3,000 floor. At $3,500 or less, free recovery restores $5,000 at most once per 24 server-clock hours; row locking prevents duplicate claims. There are no paid top-ups.

## Atomic settlement and abuse controls

A single transaction inserts a uniquely identified match, locks profile rows in sorted ID order, writes participant results, updates profile statistics and inserts one wallet ledger entry per profile. Duplicate match IDs do nothing; overlapping matches serialize on profile locks. A failure rolls back all writes. Database constraints reject negative/invalid career balances. The persisted result includes revealed appraisals, paid prices and full final standings for collection history.

Ranked settlement requires two or more known profiles, no duplicated identity and eligibility confirmed by the server room. Server-issued device identities are checked for duplicates. Shared IP/NAT alone is not grounds to reject friends. After three ranked matches against the same opponent within 24 hours, further shared results do not grant ranked progression; the cap is rechecked under profile locks to prevent concurrent bypass. The HTTP layer also limits guest creation and queues. These are lightweight barriers, not proof that every player is a distinct human: clearing cookies, using devices/proxies or colluding can still evade guest-only controls. Public deployment should add monitored abuse detection and verified account upgrades before competitive launch.

## Verification

`npx tsx --test tests/progression-v2.test.ts` exercises tier boundaries, bounded progression, normalized Elo, the bankruptcy floor and recovery cooldown. With a running test database, `TEST_DATABASE=1 npx tsx --test tests/progression-v2.test.ts` additionally exercises session forgery rejection, recovery rotation and old-session revocation, hash-only credential storage, shared-device risk, concurrent duplicate settlement, private-mode progression isolation, persistent history, invalid scoring rejection, concurrent distinct settlements at the repeated-opponent cap, and single-credit concurrent free recovery. The database test creates uniquely named disposable test profiles/results without deleting existing records.

The database integration suite was run against the local PostgreSQL instance on 26 October 2026: the original six tests passed, including the database-backed concurrency checks. A separate fresh cluster was also initialized on port 54330, completed the same six tests, and shut down cleanly with its data retained.

Implementation references: [Drizzle PostgreSQL driver](https://orm.drizzle.team/docs/get-started-postgresql), [Drizzle transactions](https://orm.drizzle.team/docs/transactions).

Final verification also covers tied ranks and shared wins; all seven persistence-suite tests pass against PostgreSQL.
