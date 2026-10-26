import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "./config";
import type { MatchHistory, Profile, Standing } from "../src/shared/market";
import {
  INITIAL_SCHEMA_SQL,
  ledger,
  matches,
  participants,
  profiles,
  sessions,
} from "./schema";
import {
  applyRankedProgression,
  recoveryAllowed,
  STARTING_BANKROLL,
} from "./progression";

const pool = new Pool({
  connectionString:
    config.databaseUrl,
  max: 8,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
});
const db = drizzle(pool);
let initialized: Promise<void> | undefined;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const sessionLifetime = 30 * 24 * 60 * 60 * 1_000;

export function initPersistence(): Promise<void> {
  return (initialized ??= db
    .execute(sql.raw(INITIAL_SCHEMA_SQL))
    .then(() => undefined)
    .catch((error: unknown) => {
      initialized = undefined;
      throw error;
    }));
}
export async function closePersistence() {
  await pool.end();
}
export async function persistenceHealthy() {
  try {await pool.query("SELECT 1");return true;}catch{return false;}
}

function nickname(value: string): string {
  if (typeof value !== "string") throw new Error("Choose a nickname");
  const safe = value
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim()
    .slice(0, 24);
  if (!safe) throw new Error("Choose a nickname between 1 and 24 characters");
  return safe;
}
function toProfile(p: typeof profiles.$inferSelect): Profile {
  return {
    id: p.id,
    nickname: p.nickname,
    bankroll: p.bankroll,
    rating: p.rating,
    wins: p.wins,
    matches: p.matches,
    totalProfit: p.totalProfit,
    biggestFlip: p.biggestFlip,
    recoveryAt: p.recoveryAt?.toISOString() ?? null,
  };
}
function credentials() {
  return {
    sessionToken: randomBytes(32).toString("base64url"),
    recoveryCode: `BM-${randomBytes(20).toString("hex").toUpperCase()}`,
  };
}
function normalizeRecovery(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export async function createGuest(
  name: string,
  deviceKey?: string,
  networkKey?: string,
) {
  await initPersistence();
  const id = randomUUID();
  const secrets = credentials();
  const profile = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(profiles)
      .values({
        id,
        nickname: nickname(name),
        recoveryHash: hash(secrets.recoveryCode),
        deviceHash: deviceKey ?? null,
        networkHash: networkKey ?? null,
      })
      .returning();
    await tx.insert(sessions).values({
      tokenHash: hash(secrets.sessionToken),
      profileId: id,
      expiresAt: new Date(Date.now() + sessionLifetime),
    });
    return toProfile(created);
  });
  return { profile, ...secrets };
}

export async function resolveSession(token: string): Promise<Profile | null> {
  if (typeof token !== "string" || token.length < 30 || token.length > 200)
    return null;
  await initPersistence();
  const [row] = await db
    .select({ profile: profiles })
    .from(sessions)
    .innerJoin(profiles, eq(sessions.profileId, profiles.id))
    .where(
      and(
        eq(sessions.tokenHash, hash(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ? toProfile(row.profile) : null;
}

export async function revokeSession(token: string): Promise<void> {
  await initPersistence();
  await db.delete(sessions).where(eq(sessions.tokenHash, hash(token)));
}

export async function getProfile(id: string): Promise<Profile | null> {
  await initPersistence();
  const [row] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);
  return row ? toProfile(row) : null;
}

export async function renameProfile(
  id: string,
  name: string,
): Promise<Profile> {
  await initPersistence();
  const [row] = await db
    .update(profiles)
    .set({ nickname: nickname(name) })
    .where(eq(profiles.id, id))
    .returning();
  if (!row) throw new Error("Profile not found");
  return toProfile(row);
}

export async function recoverGuest(
  code: string,
  deviceKey?: string,
  networkKey?: string,
) {
  if (typeof code !== "string" || code.length > 100)
    throw new Error("Recovery code not recognized");
  await initPersistence();
  const secrets = credentials();
  const profile = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.recoveryHash, hash(normalizeRecovery(code))))
      .for("update");
    if (!existing) throw new Error("Recovery code not recognized");
    await tx.delete(sessions).where(eq(sessions.profileId, existing.id));
    const [updated] = await tx
      .update(profiles)
      .set({
        recoveryHash: hash(secrets.recoveryCode),
        deviceHash: deviceKey ?? existing.deviceHash,
        networkHash: networkKey ?? existing.networkHash,
      })
      .where(eq(profiles.id, existing.id))
      .returning();
    await tx.insert(sessions).values({
      tokenHash: hash(secrets.sessionToken),
      profileId: existing.id,
      expiresAt: new Date(Date.now() + sessionLifetime),
    });
    return toProfile(updated);
  });
  return { profile, ...secrets };
}

/** True means ranked farming risk. Shared NAT alone is never grounds to reject a room. */
export async function getIdentityRisk(ids: string[]): Promise<boolean> {
  await initPersistence();
  const unique = [...new Set(ids)];
  if (unique.length < 2 || unique.length !== ids.length) return true;
  const rows = await db
    .select()
    .from(profiles)
    .where(inArray(profiles.id, unique));
  if (rows.length !== unique.length) return true;
  const devices = rows.map((p) => p.deviceHash).filter((s): s is string => !!s);
  if (new Set(devices).size !== devices.length) return true;
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  for (let i = 0; i < unique.length; i++)
    for (let j = i + 1; j < unique.length; j++) {
      const result =
        await db.execute(sql`SELECT count(*)::int AS total FROM bm_participants a
      JOIN bm_participants b ON a.match_id=b.match_id
      JOIN bm_matches m ON m.id=a.match_id
      WHERE a.profile_id=${unique[i]} AND b.profile_id=${unique[j]}
      AND m.ranked_applied=1 AND m.ended_at > ${cutoff}`);
      if (Number(result.rows[0]?.total ?? 0) >= 3) return true;
    }
  return false;
}

export interface SettlementInput {
  id: string;
  mode: "practice" | "private" | "ranked";
  budget: number;
  standings: Standing[];
  startedAt: number | string | Date;
  endedAt: number | string | Date;
  rankedEligible: boolean;
}

function validateSettlement(input: SettlementInput) {
  if (
    !input.id ||
    input.id.length > 128 ||
    !Number.isSafeInteger(input.budget) ||
    input.budget <= 0 ||
    input.budget > 1_000_000
  )
    throw new Error("Invalid settlement");
  if (
    !["practice", "private", "ranked"].includes(input.mode) ||
    input.standings.length < 1 ||
    input.standings.length > 6
  )
    throw new Error("Invalid settlement participants");
  if (new Set(input.standings.map((p) => p.id)).size !== input.standings.length)
    throw new Error("Duplicate settlement participant");
  for (const s of input.standings) {
    if (
      ![s.cash, s.collectionValue, s.netWorth, s.profit].every(
        Number.isSafeInteger,
      ) ||
      s.cash < 0 ||
      s.collectionValue < 0 ||
      s.netWorth !== s.cash + s.collectionValue ||
      s.profit !== s.netWorth - input.budget ||
      s.netWorth > 10_000_000
    )
      throw new Error("Inconsistent match scoring");
  }
  const started = new Date(input.startedAt),
    ended = new Date(input.endedAt);
  if (
    !Number.isFinite(started.getTime()) ||
    !Number.isFinite(ended.getTime()) ||
    ended < started
  )
    throw new Error("Invalid settlement timestamps");
}

/** One transaction owns result, statistics and wallet ledger. A duplicate match id is a no-op. */
export async function settleMatch(
  input: SettlementInput,
): Promise<{ saved: boolean; rankedApplied: boolean }> {
  validateSettlement(input);
  await initPersistence();
  const ids = input.standings.map((s) => s.id);
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(matches)
      .values({
        id: input.id,
        mode: input.mode,
        budget: input.budget,
        startedAt: new Date(input.startedAt),
        endedAt: new Date(input.endedAt),
        standings: input.standings,
        rankedApplied: 0,
      })
      .onConflictDoNothing()
      .returning({ id: matches.id });
    if (!inserted.length) {
      const [old] = await tx
        .select({ rankedApplied: matches.rankedApplied })
        .from(matches)
        .where(eq(matches.id, input.id));
      return { saved: false, rankedApplied: old?.rankedApplied === 1 };
    }
    // Stable lock order also serializes concurrent matches sharing any profile.
    const locked = await tx
      .select()
      .from(profiles)
      .where(inArray(profiles.id, [...ids].sort()))
      .orderBy(profiles.id)
      .for("update");
    const devices = locked
      .map((p) => p.deviceHash)
      .filter((s): s is string => !!s);
    let ranked =
      input.mode === "ranked" &&
      input.rankedEligible &&
      locked.length >= 2 &&
      locked.length === ids.length &&
      new Set(devices).size === devices.length;
    // Repeat-opponent protection is checked after profile locks, so concurrent settlements
    // cannot both pass the daily cap based on the same stale count.
    if (ranked) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000);
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const previous =
            await tx.execute(sql`SELECT count(*)::int AS total FROM bm_participants a
          JOIN bm_participants b ON a.match_id=b.match_id JOIN bm_matches m ON m.id=a.match_id
          WHERE a.profile_id=${ids[i]} AND b.profile_id=${ids[j]} AND m.ranked_applied=1 AND m.ended_at > ${cutoff}`);
          if (Number(previous.rows[0]?.total ?? 0) >= 3) ranked = false;
        }
    }
    if (ranked)
      await tx
        .update(matches)
        .set({ rankedApplied: 1 })
        .where(eq(matches.id, input.id));
    const peerProfiles = locked.map(toProfile);
    const ordered = [...input.standings].sort(
      (a, b) => b.netWorth - a.netWorth || b.cash - a.cash,
    );
    for (const stored of locked) {
      const standing = input.standings.find((s) => s.id === stored.id)!;
      await tx.insert(participants).values({
        matchId: input.id,
        profileId: stored.id,
        rank: 1 + ordered.filter((s) => s.netWorth > standing.netWorth).length,
        netWorth: standing.netWorth,
        profit: standing.profit,
      });
      if (!ranked) continue;
      const before = toProfile(stored);
      const after = applyRankedProgression(
        before,
        standing,
        peerProfiles,
        input.standings,
      );
      await tx
        .update(profiles)
        .set({
          bankroll: after.bankroll,
          rating: after.rating,
          wins: after.wins,
          matches: after.matches,
          totalProfit: after.totalProfit,
          biggestFlip: after.biggestFlip,
        })
        .where(eq(profiles.id, stored.id));
      await tx.insert(ledger).values({
        id: `${input.id}:${stored.id}`,
        profileId: stored.id,
        matchId: input.id,
        delta: after.bankroll - before.bankroll,
        balanceAfter: after.bankroll,
        reason: "ranked-result",
      });
    }
    return { saved: true, rankedApplied: ranked };
  });
}

export async function getHistory(id: string): Promise<MatchHistory[]> {
  await initPersistence();
  const rows = await db
    .select({ match: matches, participant: participants })
    .from(participants)
    .innerJoin(matches, eq(matches.id, participants.matchId))
    .where(eq(participants.profileId, id))
    .orderBy(desc(matches.endedAt))
    .limit(50);
  return rows.map(({ match, participant }) => ({
    id: match.id,
    at: match.endedAt.toISOString(),
    mode: match.mode,
    rank: participant.rank,
    profit: participant.profit,
    netWorth: participant.netWorth,
    budget: match.budget,
    standings: match.standings as Standing[],
  }));
}

export async function recoverBankroll(id: string): Promise<Profile> {
  await initPersistence();
  return db.transaction(async (tx) => {
    const [stored] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, id))
      .for("update");
    if (!stored) throw new Error("Profile not found");
    if (!recoveryAllowed(stored.bankroll, stored.recoveryAt))
      throw new Error(
        "Recovery is available at $3,500 or less, once per 24 hours",
      );
    const recoveryAt = new Date();
    const [updated] = await tx
      .update(profiles)
      .set({ bankroll: STARTING_BANKROLL, recoveryAt })
      .where(eq(profiles.id, id))
      .returning();
    await tx.insert(ledger).values({
      id: `recovery:${id}:${recoveryAt.toISOString()}`,
      profileId: id,
      delta: STARTING_BANKROLL - stored.bankroll,
      balanceAfter: STARTING_BANKROLL,
      reason: "free-recovery",
    });
    return toProfile(updated);
  });
}
