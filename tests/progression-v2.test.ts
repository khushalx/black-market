import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRankedProgression,
  budgetForTier,
  progressionDelta,
  ratingDelta,
  recoveryAllowed,
  tierForBankroll,
} from "../server/progression";
import type { Profile, Standing } from "../src/shared/market";

const profile = (id: string, overrides: Partial<Profile> = {}): Profile => ({
  id,
  nickname: id,
  bankroll: 5_000,
  rating: 1_000,
  wins: 0,
  matches: 0,
  totalProfit: 0,
  biggestFlip: 0,
  ...overrides,
});
const standing = (
  id: string,
  profit: number,
  overrides: Partial<Standing> = {},
): Standing => ({
  id,
  nickname: id,
  cash: 5_000 + profit,
  collectionValue: 0,
  netWorth: 5_000 + profit,
  profit,
  returnPercent: profit / 50,
  purchases: [],
  ...overrides,
});

test("career tier boundaries derive eligibility while each tier has one fixed match budget", () => {
  assert.equal(tierForBankroll(3_000), "starter");
  assert.equal(tierForBankroll(7_499), "starter");
  assert.equal(tierForBankroll(7_500), "collector");
  assert.equal(tierForBankroll(24_999), "collector");
  assert.equal(tierForBankroll(25_000), "high-roller");
  assert.equal(budgetForTier("starter"), 5_000);
  assert.equal(budgetForTier("collector"), 15_000);
  assert.equal(budgetForTier("high-roller"), 50_000);
});

test("career performance is bounded and scales to the equal match starting cash", () => {
  assert.equal(progressionDelta(1_000, 5_000), 100);
  assert.equal(progressionDelta(-1_000, 5_000), -100);
  assert.equal(progressionDelta(100_000, 5_000), 500);
  assert.equal(progressionDelta(-100_000, 5_000), -500);
  assert.equal(progressionDelta(3_000, 15_000), 100);
  assert.throws(() => progressionDelta(1_000, 0));
});

test("pairwise Elo treats equal wealth as a draw and normalizes across the room", () => {
  const a = profile("a"),
    b = profile("b"),
    c = profile("c");
  assert.equal(
    ratingDelta(a, [a, b], [standing("a", 100), standing("b", 0)]),
    12,
  );
  assert.equal(ratingDelta(a, [a, b], [standing("a", 0), standing("b", 0)]), 0);
  assert.equal(
    ratingDelta(
      a,
      [a, b, c],
      [standing("a", 100), standing("b", 0), standing("c", -100)],
    ),
    12,
  );
  assert.ok(
    ratingDelta(
      profile("a", { rating: 1_400 }),
      [profile("a", { rating: 1_400 }), b],
      [standing("a", -100), standing("b", 100)],
    ) < -12,
  );
});

test("ranked progression keeps a bankruptcy floor and uses realized flip profit", () => {
  const a = profile("a", { bankroll: 3_100 }),
    b = profile("b");
  const results = [standing("b", 1_000), standing("a", -4_000)];
  const updated = applyRankedProgression(a, results[1], [a, b], results);
  assert.equal(updated.bankroll, 3_000);
  assert.equal(updated.matches, 1);
  assert.equal(updated.wins, 0);
  assert.equal(updated.totalProfit, -4_000);
  assert.equal(a.bankroll, 3_100);
});

test("free recovery has a low-balance condition and a 24-hour server-clock cooldown", () => {
  const now = Date.UTC(2026, 9, 26, 12);
  assert.equal(recoveryAllowed(3_500, null, now), true);
  assert.equal(recoveryAllowed(3_501, null, now), false);
  assert.equal(
    recoveryAllowed(3_000, new Date(now - 23 * 3_600_000), now),
    false,
  );
  assert.equal(
    recoveryAllowed(3_000, new Date(now - 24 * 3_600_000), now),
    true,
  );
  assert.equal(recoveryAllowed(3_000, new Date(now + 1), now), false);
});
test("equal final wealth shares first place without arbitrary rating or career advantage", () => {
  const a = profile("a"),
    b = profile("b");
  const results = [standing("b", 0), standing("a", 0)];
  for (const p of [a, b]) {
    const result = applyRankedProgression(
      p,
      results.find((s) => s.id === p.id)!,
      [a, b],
      results,
    );
    assert.equal(result.wins, 1);
    assert.equal(result.rating, 1000);
    assert.equal(result.bankroll, 5000);
  }
});

test(
  "PostgreSQL sessions, recovery rotation, concurrent settlement and farming protection",
  { skip: process.env.TEST_DATABASE !== "1" },
  async () => {
    const persistence = await import("../server/persistence");
    const {
      createGuest,
      resolveSession,
      recoverGuest,
      settleMatch,
      getProfile,
      getHistory,
      getIdentityRisk,
      recoverBankroll,
      closePersistence,
    } = persistence;
    try {
      const suffix = crypto.randomUUID();
      const a = await createGuest(
        "Alice",
        `device-a-${suffix}`,
        "shared-network",
      );
      const b = await createGuest(
        "Ben",
        `device-b-${suffix}`,
        "shared-network",
      );
      assert.equal(a.profile.bankroll, 5_000);
      assert.equal((await resolveSession(a.sessionToken))?.id, a.profile.id);
      assert.equal(
        await resolveSession("forged-session-token-that-is-long-enough"),
        null,
      );
      assert.equal(
        await getIdentityRisk([a.profile.id, b.profile.id]),
        false,
        "shared NAT is permitted",
      );
      const duplicateDevice = await createGuest(
        "Alt",
        `device-a-${suffix}`,
        "shared-network",
      );
      assert.equal(
        await getIdentityRisk([a.profile.id, duplicateDevice.profile.id]),
        true,
      );
      const rotated = await recoverGuest(
        a.recoveryCode,
        `device-a-${suffix}`,
        "shared-network",
      );
      assert.equal(rotated.profile.id, a.profile.id);
      assert.equal(await resolveSession(a.sessionToken), null);
      assert.equal(
        (await resolveSession(rotated.sessionToken))?.id,
        a.profile.id,
      );
      await assert.rejects(() => recoverGuest(a.recoveryCode));
      const { Pool } = await import("pg");
      const auditPool = new Pool({
        connectionString:
          process.env.DATABASE_URL ??
          "postgres://blackmarket:blackmarket@127.0.0.1:54329/blackmarket",
      });
      try {
        const secrets = await auditPool.query(
          "SELECT recovery_hash FROM bm_profiles WHERE id=$1",
          [a.profile.id],
        );
        assert.match(secrets.rows[0].recovery_hash, /^[a-f0-9]{64}$/);
        assert.notEqual(secrets.rows[0].recovery_hash, rotated.recoveryCode);
        const tokens = await auditPool.query(
          "SELECT token_hash FROM bm_sessions WHERE profile_id=$1",
          [a.profile.id],
        );
        assert.equal(tokens.rowCount, 1);
        assert.match(tokens.rows[0].token_hash, /^[a-f0-9]{64}$/);
        assert.notEqual(tokens.rows[0].token_hash, rotated.sessionToken);
      } finally {
        await auditPool.end();
      }
      const standings = [
        standing(a.profile.id, 1_000),
        standing(b.profile.id, -500),
      ];
      const input = {
        id: `test-${suffix}`,
        mode: "ranked" as const,
        budget: 5_000,
        standings,
        startedAt: Date.now() - 10_000,
        endedAt: Date.now(),
        rankedEligible: true,
      };
      const concurrent = await Promise.all([
        settleMatch(input),
        settleMatch(input),
      ]);
      assert.equal(concurrent.filter((r) => r.saved).length, 1);
      assert.equal((await getProfile(a.profile.id))?.bankroll, 5_100);
      assert.equal((await getProfile(a.profile.id))?.matches, 1);
      assert.equal((await getProfile(b.profile.id))?.bankroll, 4_950);
      assert.equal((await getHistory(a.profile.id)).length, 1);
      await settleMatch({ ...input, id: `private-${suffix}`, mode: "private" });
      assert.equal(
        (await getProfile(a.profile.id))?.bankroll,
        5_100,
        "private matches cannot farm career cash",
      );
      await assert.rejects(() =>
        settleMatch({
          ...input,
          id: `forged-${suffix}`,
          standings: [standing(a.profile.id, 1_000, { netWorth: 999_999 })],
        }),
      );
      // These independent result transactions touch the same profiles. Sorted locks
      // must serialize both the wallet writes and the repeated-opponent check.
      const more = await Promise.all([
        settleMatch({ ...input, id: `ranked-two-${suffix}` }),
        settleMatch({ ...input, id: `ranked-three-${suffix}` }),
      ]);
      assert.equal(more.filter((r) => r.rankedApplied).length, 2);
      assert.equal((await getProfile(a.profile.id))?.bankroll, 5_300);
      assert.equal((await getProfile(a.profile.id))?.matches, 3);
      const capped = await settleMatch({
        ...input,
        id: `ranked-four-${suffix}`,
      });
      assert.equal(
        capped.saved,
        true,
        "result history is retained even when farming rewards are blocked",
      );
      assert.equal(capped.rankedApplied, false);
      assert.equal((await getProfile(a.profile.id))?.bankroll, 5_300);
      assert.equal((await getHistory(a.profile.id)).length, 5);
      assert.equal(await getIdentityRisk([a.profile.id, b.profile.id]), true);

      const recoveryPool = new (await import("pg")).Pool({
        connectionString:
          process.env.DATABASE_URL ??
          "postgres://blackmarket:blackmarket@127.0.0.1:54329/blackmarket",
      });
      try {
        await recoveryPool.query(
          "UPDATE bm_profiles SET bankroll=3300 WHERE id=$1",
          [duplicateDevice.profile.id],
        );
        const recoveries = await Promise.allSettled([
          recoverBankroll(duplicateDevice.profile.id),
          recoverBankroll(duplicateDevice.profile.id),
        ]);
        assert.equal(
          recoveries.filter((r) => r.status === "fulfilled").length,
          1,
        );
        assert.equal(
          (await getProfile(duplicateDevice.profile.id))?.bankroll,
          5_000,
        );
        const credits = await recoveryPool.query(
          "SELECT count(*)::int AS total FROM bm_ledger WHERE profile_id=$1 AND reason='free-recovery'",
          [duplicateDevice.profile.id],
        );
        assert.equal(credits.rows[0].total, 1);
      } finally {
        await recoveryPool.end();
      }
      const tiedGuests = await Promise.all(
        [0, 1].map((i) => createGuest(`Tie QA ${i}`, `tie-${suffix}-${i}`)),
      );
      await settleMatch({
        ...input,
        id: `tie-${suffix}`,
        standings: tiedGuests.map((g) => standing(g.profile.id, 0)),
      });
      for (const g of tiedGuests) {
        assert.equal((await getProfile(g.profile.id))?.wins, 1);
        assert.equal((await getHistory(g.profile.id))[0].rank, 1);
      }
    } finally {
      await closePersistence();
    }
  },
);
