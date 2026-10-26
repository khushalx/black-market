import type { Profile, Standing, Tier } from "../src/shared/market";

export const STARTING_BANKROLL = 5_000;
export const BANKROLL_FLOOR = 3_000;
export const RECOVERY_COOLDOWN_MS = 24 * 60 * 60 * 1_000;

/** Career cash determines eligibility, never an individual's cash inside a match. */
export function tierForBankroll(bankroll: number): Tier {
  if (bankroll >= 25_000) return "high-roller";
  if (bankroll >= 7_500) return "collector";
  return "starter";
}

export function budgetForTier(tier: Tier): number {
  return { starter: 5_000, collector: 15_000, "high-roller": 50_000 }[tier];
}

/** A 20% match ROI earns $100 career cash. Changes are capped at +/-$500. */
export function progressionDelta(profit: number, startingCash: number): number {
  if (
    !Number.isFinite(profit) ||
    !Number.isSafeInteger(startingCash) ||
    startingCash <= 0
  )
    throw new Error("Invalid ranked result");
  return Math.max(
    -500,
    Math.min(500, Math.round((profit / startingCash) * 500)),
  );
}

/** Pairwise Elo, normalized across opponents so a six-person match cannot inflate K. */
export function ratingDelta(
  player: Pick<Profile, "id" | "rating">,
  profiles: Pick<Profile, "id" | "rating">[],
  standings: Pick<Standing, "id" | "netWorth">[],
): number {
  const own = standings.find((s) => s.id === player.id);
  const opponents = profiles.filter((p) => p.id !== player.id);
  if (!own || opponents.length === 0) return 0;
  let result = 0;
  for (const opponent of opponents) {
    const other = standings.find((s) => s.id === opponent.id);
    if (!other) continue;
    const score =
      own.netWorth > other.netWorth
        ? 1
        : own.netWorth === other.netWorth
          ? 0.5
          : 0;
    const expected = 1 / (1 + 10 ** ((opponent.rating - player.rating) / 400));
    result += score - expected;
  }
  return Math.round((24 * result) / opponents.length);
}

export function recoveryAllowed(
  bankroll: number,
  recoveryAt: string | Date | null | undefined,
  now = Date.now(),
): boolean {
  return (
    bankroll <= 3_500 &&
    (!recoveryAt ||
      now - new Date(recoveryAt).getTime() >= RECOVERY_COOLDOWN_MS)
  );
}

export function biggestPurchaseProfit(standing: Standing): number {
  return Math.max(
    0,
    ...standing.purchases.map(
      (p) => (p.soldFor ?? p.appraisal?.value ?? p.paid) - p.paid,
    ),
  );
}

export function applyRankedProgression(
  profile: Profile,
  standing: Standing,
  peers: Profile[],
  standings: Standing[],
): Profile {
  const ranked = [...standings].sort(
    (a, b) => b.netWorth - a.netWorth || b.cash - a.cash,
  );
  return {
    ...profile,
    bankroll: Math.max(
      BANKROLL_FLOOR,
      profile.bankroll +
        progressionDelta(standing.profit, standing.netWorth - standing.profit),
    ),
    rating: Math.max(
      100,
      Math.min(3_000, profile.rating + ratingDelta(profile, peers, standings)),
    ),
    wins: profile.wins + (ranked[0]?.netWorth === standing.netWorth ? 1 : 0),
    matches: profile.matches + 1,
    totalProfit: profile.totalProfit + standing.profit,
    biggestFlip: Math.max(profile.biggestFlip, biggestPurchaseProfit(standing)),
  };
}
