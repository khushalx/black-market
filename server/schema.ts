import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const profiles = pgTable("bm_profiles", {
  id: text("id").primaryKey(),
  nickname: text("nickname").notNull(),
  bankroll: integer("bankroll").notNull().default(5_000),
  rating: integer("rating").notNull().default(1_000),
  wins: integer("wins").notNull().default(0),
  matches: integer("matches").notNull().default(0),
  totalProfit: integer("total_profit").notNull().default(0),
  biggestFlip: integer("biggest_flip").notNull().default(0),
  recoveryHash: text("recovery_hash").unique(),
  deviceHash: text("device_hash"),
  networkHash: text("network_hash"),
  recoveryAt: timestamp("recovery_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const sessions = pgTable("bm_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const matches = pgTable("bm_matches", {
  id: text("id").primaryKey(),
  mode: text("mode").notNull(),
  budget: integer("budget").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
  standings: jsonb("standings").notNull(),
  rankedApplied: integer("ranked_applied").notNull().default(0),
});
export const participants = pgTable(
  "bm_participants",
  {
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id),
    rank: integer("rank").notNull(),
    netWorth: integer("net_worth").notNull(),
    profit: integer("profit").notNull(),
  },
  (table) => [primaryKey({ columns: [table.matchId, table.profileId] })],
);
export const ledger = pgTable("bm_ledger", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  matchId: text("match_id").references(() => matches.id),
  delta: integer("delta").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Deliberately explicit initial migration; future changes must use a new migration. */
export const INITIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bm_profiles (
 id TEXT PRIMARY KEY, nickname TEXT NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 24),
 bankroll INTEGER NOT NULL DEFAULT 5000 CHECK (bankroll >= 3000),
 rating INTEGER NOT NULL DEFAULT 1000 CHECK (rating BETWEEN 100 AND 3000),
 wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0), matches INTEGER NOT NULL DEFAULT 0 CHECK (matches >= 0),
 total_profit INTEGER NOT NULL DEFAULT 0, biggest_flip INTEGER NOT NULL DEFAULT 0 CHECK (biggest_flip >= 0),
 recovery_hash TEXT UNIQUE, device_hash TEXT, network_hash TEXT, recovery_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bm_sessions (
 token_hash TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES bm_profiles(id), expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS bm_sessions_profile_idx ON bm_sessions(profile_id);
CREATE TABLE IF NOT EXISTS bm_matches (
 id TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK (mode IN ('practice','private','ranked')),
 budget INTEGER NOT NULL CHECK (budget > 0), started_at TIMESTAMPTZ NOT NULL, ended_at TIMESTAMPTZ NOT NULL,
 standings JSONB NOT NULL, ranked_applied INTEGER NOT NULL DEFAULT 0 CHECK (ranked_applied IN (0,1))
);
CREATE TABLE IF NOT EXISTS bm_participants (
 match_id TEXT NOT NULL REFERENCES bm_matches(id), profile_id TEXT NOT NULL REFERENCES bm_profiles(id),
 rank INTEGER NOT NULL CHECK (rank > 0), net_worth INTEGER NOT NULL CHECK (net_worth >= 0), profit INTEGER NOT NULL,
 PRIMARY KEY (match_id,profile_id)
);
CREATE INDEX IF NOT EXISTS bm_participants_profile_idx ON bm_participants(profile_id);
CREATE TABLE IF NOT EXISTS bm_ledger (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES bm_profiles(id), match_id TEXT REFERENCES bm_matches(id),
 delta INTEGER NOT NULL CHECK (delta BETWEEN -500 AND 2000), balance_after INTEGER NOT NULL CHECK (balance_after >= 3000),
 reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
