# BLACK MARKET implementation plan

1. Replace fictional inventory with a typed, expandable real-item catalog. Store source status, image rights, reference dates, and explicit valuation adjustments; never invent completed sales.
2. Use one deterministic auction domain for server-authoritative online rooms and explicitly offline practice. Eight lots, equal tier budgets, two truthful inspections, bounded overtime, automatic settlement, and optional dealer liquidity.
3. Run a Colyseus Node server beside Next.js. Send sanitized public snapshots and owner-only inspection messages. Validate every command, hold disconnected seats, and lock active rooms.
4. Add PostgreSQL/Drizzle profiles, hashed guest sessions, recovery codes, match records and atomic idempotent ranked progression. Match queues derive eligibility from persisted profiles; practice/private play never farms ranked progression.
5. Replace the poster interface with restrained product photography, compact bidding, a horizontal participant strip and secondary drawers. Add room creation, joining, readiness, history and rematches.
6. Validate rules, valuation, privacy, matchmaking, database transactions and multiple independent Colyseus clients; then exercise separate browser sessions and responsive screenshots. Document deployment requirements and verification limits precisely.
