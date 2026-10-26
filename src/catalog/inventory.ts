import { catalog } from "./index";
import { collectibility } from "./lot-generator";
import type { PublicItem } from "../shared/market";

/** Bounded-memory, category-balanced shuffle bag. A room retains it across rematches. */
export class InventoryDeck {
  private seen = new Set<string>();
  constructor(private random: () => number = Math.random, private inventory: readonly PublicItem[] = catalog) {}
  private roll() {
    const value = this.random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw Error("Inventory random source must return a number in [0, 1).");
    return value;
  }
  draw(count: number, budget: number): PublicItem[] {
    if (!Number.isSafeInteger(count) || count < 1 || !Number.isFinite(budget) || budget <= 0)
      throw Error("Invalid inventory request.");
    const eligible = this.inventory.filter(i => i.referenceValue >= 25 && i.referenceValue <= budget / 2);
    if (eligible.length < count) throw Error("Not enough eligible inventory for this budget.");
    const picked: PublicItem[] = [], used = new Set<string>(), categoryCounts = new Map<string,number>();
    const weights = { Everyday: 1, Uncommon: 0.65, Rare: 0.28, Grail: 0.1 };
    while (picked.length < count) {
      let available = eligible.filter(i => !used.has(i.id) && !this.seen.has(i.id));
      if (!available.length) {
        // Exhaust every eligible model before beginning the next cycle.
        this.seen.clear();
        available = eligible.filter(i => !used.has(i.id));
      }
      const categories = [...new Set(available.map(i => i.category))];
      const least = Math.min(...categories.map(c => categoryCounts.get(c) ?? 0));
      const balanced = categories.filter(c => (categoryCounts.get(c) ?? 0) === least);
      const category = balanced[Math.floor(this.roll() * balanced.length)];
      const candidates = available.filter(i => i.category === category);
      let cursor = this.roll() * candidates.reduce((total,i) => total + weights[collectibility(i.referenceValue)],0);
      const item = candidates.find(i => (cursor -= weights[collectibility(i.referenceValue)]) < 0) ?? candidates[candidates.length - 1];
      picked.push(item); used.add(item.id); this.seen.add(item.id);
      categoryCounts.set(category,(categoryCounts.get(category) ?? 0)+1);
    }
    return picked;
  }
}
