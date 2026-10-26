# Local PostgreSQL through Docker Compose

`compose.yaml` defines PostgreSQL 17, user/database `blackmarket`, and loopback port `54329` mapped to container port `5432`. Its development password matches the existing `.env.local` URL. The `blackmarket_pg` named volume persists data; the readiness check uses `pg_isready`. Backend, migrations and frontend load `.env.local`; explicit environment variables override files.

## Docker Desktop setup on this Mac

1. Download [Docker Desktop for Mac with Apple silicon](https://docs.docker.com/desktop/setup/install/mac-install/).
2. Open the DMG and drag Docker to Applications.
3. Open Docker Desktop. Complete its first-run setup and review/accept its agreement yourself. Wait until Docker Engine is running.
4. Open a new terminal and check `docker version` (both Client and Server) and `docker compose version`. If the CLI is not found, check Docker Desktop's CLI installation/PATH settings; a user installation may place it in `$HOME/.docker/bin`.

## Completed local setup: 2026-10-26

Docker Desktop 4.96.3 is installed and signature-verified. The damaged installation had a truncated `desktop.img`; the mounted official installer passed its disk-image checksum and app-signature checks. The app was reinstalled from it without bypassing macOS security checks or changing Docker user data. Docker Engine 29.9.2 and Compose 5.6.1 respond, and an ARM64 `hello-world` container completed successfully. A fresh login terminal resolves the Docker CLI in `$HOME/.docker/bin`.

The previous embedded PostgreSQL 18.4 database was logically backed up using the PostgreSQL 18 client, after stopping application traffic. The private backup is `.local/backups/docker-migration-20261026/blackmarket.dump`; the original cluster remains intact in `.local/postgres`. Compose now runs PostgreSQL 17.11 on `127.0.0.1:54329`, with persistent volume `blackmarket_blackmarket_pg`. The restore ran in a single transaction with errors treated as fatal. All five application tables matched their source row counts and SHA-256 row digests before any new tests wrote records:

| Table | Preserved rows |
| --- | ---: |
| bm_profiles | 108 |
| bm_sessions | 104 |
| bm_matches | 63 |
| bm_participants | 150 |
| bm_ledger | 74 |

Source and restored manifests are kept beside the backup with private permissions. The existing migration succeeds against Docker. The `.env.local` credentials, database, host and port match the resolved Compose configuration. Colyseus is healthy on 2567, and Next.js is serving on 3000. The launcher explicitly pins Next.js to 3000 so the backend's shared `PORT=2567` cannot cause a frontend port collision. Seven database tests, lint and type checking pass. No UI or gameplay source was changed.

Two independent browser sessions (`localhost:3000` and `127.0.0.1:3000`, separate identities and cookies) completed room `591516` against Docker PostgreSQL: four lots, two humans, no bots. Live $25/$50 bids synchronized, the second browser reloaded and recovered its leading bid, and both browsers displayed the same saved results: Blake $5,138 and Compose QA A $5,056. SQL verified two distinct participant IDs, the corresponding results and no ranked progression. The guest's history displayed the new receipt alongside pre-migration matches. Both browser warning/error logs were empty. Test room sessions were left afterward and the temporary host signed out. Evidence is in `.local/verification/2026-10-26/compose-browser-a.jpg`, `compose-browser-b.jpg` and `docker-ready.png`.

Do not use `docker compose down -v`, which removes the named database volume. Keep the original cluster and logical backup until their recovery copies are no longer needed. Normal development uses Docker; do not start the embedded runtime on the same port.

## Normal startup

```sh
npm run dev
```

This starts Compose with a health wait, then the backend and Next.js. Startup reports missing Docker or an unavailable engine explicitly and never falls back to embedded PostgreSQL.

For separate service terminals:

```sh
npm run db:dev
npm run db:migrate
npm run server
```

Then run `npm run dev:web` in another terminal. Stop PostgreSQL with `npm run db:stop`; this preserves its volume. Set `DATABASE_URL` to a different PostgreSQL endpoint to use it without starting the local Compose service. Neon is reserved for later public deployment; nothing is deployed by these commands.
