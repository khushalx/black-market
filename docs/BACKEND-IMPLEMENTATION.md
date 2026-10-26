# Backend implementation plan

The repository already has one shared Auction engine, separate Colyseus 0.18 process, official SDK transport, PostgreSQL/Drizzle sessions and settlement, private rooms and a real public queue. Practice uses the same pure rules locally; online clients only submit commands. Keep the existing design and expanded catalog.

1. Audit the installed 0.18 APIs against current official room/authentication/reconnection, queue, state-view, testing and deployment documentation.
2. Harden configuration, HTTP/WebSocket origins, input limits, room-code allocation and authenticated seat reservations. Keep private inspections in targeted messages.
3. Make disconnections, abandoned matches, queue cancellation and shutdown preserve authoritative financial results. Add measured clock synchronization to the existing adapter.
4. Run rules/security/database tests and two- and four-client live scenarios, including bidding, reconnection, complete results and rematches. Fix failures before the final build.
5. Update local setup, migration, deployment and limitation documentation. Verify the visual/catalog baseline is unchanged.

Use the existing signed room tickets and opaque, hash-only PostgreSQL guest sessions. The official authentication/database modules were evaluated; replacing functioning recovery and transactional progression would add a conflicting identity system. Likewise retain the server-profile-derived queue over Colyseus matchMaker rather than adding a second QueueRoom. Its compatibility and timeout behavior is explicit and covered by live tests.
