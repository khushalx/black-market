# Connect the public website to the game server

## Verified issue on 2026-10-26

The frontend at `https://black-market-kappa.vercel.app` responds successfully. Its `/api/me` and `/api/rooms` requests return HTTP 404 with Vercel's `DNS_HOSTNAME_RESOLVED_PRIVATE` error. This means the API rewrite targets a private address. The code defaults to `http://127.0.0.1:2567` when `API_ORIGIN` is not configured. The published client bundle also falls back to the website's hostname on port 2567 because `NEXT_PUBLIC_WS_URL` was not supplied at build time.

Local Docker services are separate from the deployed website. Running PostgreSQL and Colyseus on a developer's Mac does not provide a public game-server endpoint for Vercel or other players.

## Required production services

| Service | Current role | Required configuration |
| --- | --- | --- |
| Vercel | Next.js frontend | Public Colyseus HTTP and WebSocket endpoint |
| One persistent Node/container service | Colyseus rooms and HTTP API | HTTPS/WSS, Neon credentials, session secret, allowed frontend origin |
| Neon PostgreSQL | Profiles, sessions and completed matches | Provider-issued PostgreSQL connection string with verified TLS |

The current room state and matchmaking live in one Node process. Keep one backend instance without sleeping or automatic scale-to-zero. Vercel's current WebSocket support does not by itself launch this separate Colyseus entry point or make its process-local room state shared across instances.

## Prepared backend image

```sh
docker build -f Dockerfile.server -t black-market-server .
```

The image starts `server/index.ts` directly as an unprivileged user and forwards SIGTERM to Node. It includes runtime dependencies, the shared game engine/catalog, and the existing migration entry point. Docker build context excludes environment files, local databases/backups, Git metadata and local build output. It does not change UI or gameplay.

Local validation on 2026-10-26: the production image built successfully, started with production configuration on loopback port 2568, and returned `/health` with `database: ready` against the existing Compose PostgreSQL. Runtime UID was 1000, `/app/.env.local` and `/app/.local` were absent, and SIGTERM shutdown exited with code 0. The temporary test container and its temporary environment file were removed. This verifies the packaged backend locally; it does not verify a public host, Neon connection or live multiplayer deployment.

On the selected backend host, set these server-only values in its environment/secret settings:

```text
NODE_ENV=production
DATABASE_URL=<Neon's PostgreSQL connection string with verified TLS>
SESSION_SECRET=<a persistent random secret of at least 32 characters>
APP_ORIGIN=https://black-market-kappa.vercel.app
```

Use the platform's assigned `PORT` (the image defaults to 2567). Set `TRUST_PROXY_HOPS` to match the actual trusted proxy chain; its default is 0. Select `/health` as the readiness endpoint. It returns 200 only after an authenticated database query succeeds. Allow at least 30 seconds for graceful shutdown.

The backend waits for the existing idempotent schema migration before listening. A separate migration job can run:

```sh
node --import ./scripts/env.mjs --import tsx scripts/db-init.ts
```

Keep database credentials and `SESSION_SECRET` out of Vercel's public variables and Git. Do not import local test profiles into the public database by default.

## Connect Vercel after the backend is healthy

Replace the example hostname below with the actual public HTTPS backend origin:

```text
API_ORIGIN=https://your-game-server.example.com
NEXT_PUBLIC_WS_URL=https://your-game-server.example.com
```

Set both variables on the Vercel production environment and rebuild/redeploy the frontend. They are read during the build; changing the variables alone does not update an existing deployment. The official Colyseus SDK uses WSS for the HTTPS endpoint. Keep `/api/*` proxied through the frontend origin so session cookies remain on that origin.

Verify `/api/me` returns an authentication response (401 while signed out), rather than a Vercel private-address error. Then complete a match using two independent browser identities, including bids, reload/reconnection and saved receipts. Adding a different frontend domain requires adding its exact HTTPS origin to backend `APP_ORIGIN` as well.

No public backend, Neon project, account, paid plan or deployment is created by these files.

References: [Vercel private-hostname error](https://vercel.com/docs/errors/dns_hostname_resolved_private), [Vercel WebSocket state and reconnection](https://vercel.com/docs/functions/websockets), [Colyseus deployment](https://docs.colyseus.io/deployment).
