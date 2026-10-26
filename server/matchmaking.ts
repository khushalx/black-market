import type { Profile, Tier } from "../src/shared/market";
import { tierForBankroll } from "./progression";
export interface QueueEntry {
  profile: Profile;
  joinedAt: number;
  lastSeenAt?: number;
  roomId?: string;
}
export function ratingWindow(waitMs: number) {
  return Math.min(600, 150 + Math.floor(waitMs / 15000) * 100);
}
export function compatible(a: QueueEntry, b: QueueEntry, now: number) {
  return (
    tierForBankroll(a.profile.bankroll) ===
      tierForBankroll(b.profile.bankroll) &&
    Math.abs(a.profile.rating - b.profile.rating) <=
      ratingWindow(now - Math.min(a.joinedAt, b.joinedAt))
  );
}
export function selectGroup(entries: QueueEntry[], now: number): QueueEntry[] {
  const pending = entries
    .filter((e) => !e.roomId)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  for (const first of pending) {
    const group = [
      first,
      ...pending.filter((e) => e !== first && compatible(first, e, now)),
    ].slice(0, 6);
    if (
      group.length >= 3 ||
      (group.length >= 2 && now - first.joinedAt >= 10000)
    )
      return group;
  }
  return [];
}
export function tierBudget(tier: Tier) {
  return tier === "starter" ? 5000 : tier === "collector" ? 15000 : 50000;
}
