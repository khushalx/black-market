import test from "node:test";
import assert from "node:assert/strict";
import { Auction, validateSettings } from "../src/domain/auction";
import { compatible, ratingWindow, selectGroup } from "../server/matchmaking";
import type { Profile } from "../src/shared/market";
const settings = {
  maxPlayers: 4,
  lots: 4,
  previewSeconds: 3,
  auctionSeconds: 5,
  resultSeconds: 2,
};
function room() {
  const g = new Auction("TEST", "a", settings, "private", () => 0.41);
  for (const id of ["a", "b", "c", "d"]) {
    g.addPlayer(id, id);
    g.command(id, { type: "ready", ready: true }, 1000);
  }
  g.command("a", { type: "start" }, 1000);
  g.tick(4000);
  return g;
}
test("new auction validates acceptance order, commitments, requests and close time", () => {
  const g = room();
  g.command(
    "a",
    { type: "bid", amount: 500, requestId: "one-1", round: 1 },
    4100,
  );
  assert.throws(
    () =>
      g.command(
        "b",
        { type: "bid", amount: 500, requestId: "two-1", round: 1 },
        4100,
      ),
    /at least/,
  );
  assert.throws(
    () =>
      g.command(
        "a",
        { type: "bid", amount: 525, requestId: "one-2", round: 1 },
        4100,
      ),
    /already leading/,
  );
  assert.throws(
    () =>
      g.command(
        "b",
        { type: "bid", amount: 5001, requestId: "over", round: 1 },
        4100,
      ),
    /cash/,
  );
  assert.throws(
    () =>
      g.command(
        "b",
        { type: "bid", amount: 525.5, requestId: "fraction", round: 1 },
        4100,
      ),
    /Whole/,
  );
  g.command(
    "b",
    { type: "bid", amount: 550, requestId: "two-1", round: 1 },
    4200,
  );
  assert.throws(
    () =>
      g.command(
        "a",
        { type: "bid", amount: 600, requestId: "one-1", round: 1 },
        4300,
      ),
    /already processed/,
  );
  const close = g.state.closesAt;
  g.tick(close);
  const cash = g.state.players[1].cash;
  assert.equal(cash, 4450);
  g.tick(close + 1);
  assert.equal(g.state.players[1].cash, cash);
  assert.throws(
    () =>
      g.command(
        "a",
        { type: "bid", amount: 600, requestId: "late", round: 1 },
        close + 1,
      ),
    /closed/,
  );
});
test("invalid money, insufficient increments, forged seats and the exact closing boundary are rejected",()=>{
  const g=room();
  for(const amount of [-25,0,NaN,Infinity,24,25.1,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>g.command("a",{type:"bid",amount,requestId:`bad-${String(amount)}`,round:1},4100));
  assert.throws(()=>g.command("outsider",{type:"bid",amount:200,requestId:"forged",round:1},4100),/authorized/);
  g.command("a",{type:"bid",amount:200,requestId:"valid-first",round:1},4100);
  assert.throws(()=>g.command("b",{type:"bid",amount:224,requestId:"small-step",round:1},4200),/at least/);
  const close=g.state.closesAt;
  assert.throws(()=>g.command("b",{type:"bid",amount:250,requestId:"at-boundary",round:1},close),/closed/);
  assert.equal(g.state.players[0].cash,4800);
  assert.equal(g.state.players[1].cash,5000);
  assert.equal(g.state.players[0].purchases.length,1);
  for(let i=0;i<5;i++) g.tick(close+i);
  assert.equal(g.state.players[0].purchases.length,1);
});
test("inspection is truthful, owner-only, free and limited to two per match", () => {
  const g = room();
  g.command("a", { type: "inspect" }, 4100);
  const report = g.privateState("a").inspection!;
  assert.ok(report.fact);
  assert.equal(g.state.players[0].cash, 5000);
  assert.equal(g.state.players[0].inspectionsLeft, 1);
  g.command("a", { type: "inspect" }, 4200);
  assert.equal(g.state.players[0].inspectionsLeft, 1);
  assert.equal(g.privateState("b").inspection, null);
  assert.equal(JSON.stringify(g.snapshot()).includes(report.fact), false);
  assert.equal(JSON.stringify(g.snapshot()).includes('"appraisal"'), false);
  assert.throws(() => g.privateState("outsider"), /authorized/);
  g.tick(g.state.closesAt);
  g.tick(g.state.closesAt);
  g.command("a", { type: "inspect" }, g.state.serverNow);
  assert.equal(g.state.players[0].inspectionsLeft, 0);
  g.tick(g.state.closesAt);
  g.tick(g.state.closesAt);
  g.tick(g.state.closesAt);
  assert.throws(
    () => g.command("a", { type: "inspect" }, g.state.serverNow),
    /Both/,
  );
});
test("overtime is bounded, disconnected bids settle and all eight lots score correctly", () => {
  const g = new Auction(
    "EIGHT",
    "a",
    { ...settings, lots: 8 },
    "private",
    () => 0.53,
  );
  for (const id of ["a", "b"]) {
    g.addPlayer(id, id);
    g.command(id, { type: "ready", ready: true }, 1000);
  }
  g.command("a", { type: "start" }, 1000);
  for (let round = 1; round <= 8; round++) {
    g.tick(g.state.closesAt);
    const openedAt = g.state.serverNow;
    for (let n = 0; n < 5; n++) {
      g.command(
        n % 2 ? "b" : "a",
        {
          type: "bid",
          amount: (n + 1) * 25,
          requestId: `r${round}-${n}`,
          round,
        },
        g.state.closesAt - 1,
      );
    }
    assert.equal(g.state.extensions, 3);
    assert.equal(g.state.closesAt, openedAt + 20000);
    g.setConnected("a", false);
    g.tick(g.state.closesAt);
    g.setConnected("a", true);
    assert.equal(g.state.players[0].purchases.length, round);
    g.tick(g.state.closesAt);
  }
  assert.equal(g.state.phase, "finished");
  const a = g.state.standings.find((p) => p.id === "a")!;
  assert.equal(a.cash, 4000);
  assert.equal(
    a.netWorth,
    a.cash + a.purchases.reduce((n, p) => n + p.appraisal!.value, 0),
  );
  assert.equal(a.profit, a.netWorth - 5000);
  const old = g.state.matchId;
  g.command(g.state.hostId, { type: "rematch" }, g.state.serverNow + 1);
  assert.equal(g.state.phase, "lobby");
  assert.ok(
    g.state.players.every(
      (p) =>
        p.cash === 5000 && p.inspectionsLeft === 2 && p.purchases.length === 0,
    ),
  );
  assert.equal(g.state.matchId, old);
});
test("server settings and human requirements cannot be bypassed", () => {
  assert.throws(() => validateSettings({ budget: 999999 }));
  assert.throws(() => validateSettings({ maxPlayers: 1 }));
  const g = new Auction("RANK", "a", {}, "ranked");
  g.addPlayer("a", "a");
  g.command("a", { type: "ready", ready: true });
  assert.throws(() => g.command("a", { type: "start" }), /two/);
  const p = new Auction("PRACTICE", "a", { bots: true }, "private");
  p.addPlayer("a", "a");
  p.command("a", { type: "ready", ready: true });
  assert.doesNotThrow(() => p.command("a", { type: "start" }));
});
test("fair queue widens rating tolerance without crossing bankroll tiers", () => {
  const profile = (id: string, bankroll: number, rating: number) =>
    ({
      id,
      bankroll,
      rating,
      nickname: id,
      wins: 0,
      matches: 0,
      totalProfit: 0,
      biggestFlip: 0,
    }) satisfies Profile;
  const a = { profile: profile("a", 5000, 1000), joinedAt: 1000 };
  const b = { profile: profile("b", 7000, 1300), joinedAt: 2000 };
  const c = { profile: profile("c", 15000, 1000), joinedAt: 1000 };
  assert.equal(compatible(a, b, 3000), false);
  assert.equal(compatible(a, b, 40000), true);
  assert.equal(compatible(a, c, 500000), false);
  assert.equal(ratingWindow(9999999), 600);
  assert.equal(selectGroup([a, b, c], 40000).length, 2);
  assert.equal(selectGroup([a, c], 999999).length, 0);
});
test("dealer offers expire, cannot be stolen or credited twice, and sold assets are excluded from final wealth", () => {
  const g = room();
  g.command(
    "a",
    { type: "bid", amount: 25, requestId: "dealer-buy", round: 1 },
    4100,
  );
  g.tick(g.state.closesAt);
  g.tick(g.state.closesAt);
  // Leave lot two unsold and advance to the selected dealer window.
  g.tick(g.state.closesAt);
  g.tick(g.state.closesAt);
  g.tick(g.state.closesAt);
  assert.equal(g.state.round, 3);
  assert.equal(g.state.phase, "preview");
  const offer = g.privateState("a").offer!;
  assert.ok(offer);
  assert.equal(g.privateState("b").offer, null);
  const cash = g.state.players[0].cash;
  assert.throws(
    () =>
      g.command(
        "b",
        { type: "sell", purchaseId: offer.purchaseId },
        g.state.serverNow,
      ),
    /no longer/,
  );
  g.command(
    "a",
    { type: "sell", purchaseId: offer.purchaseId },
    g.state.serverNow,
  );
  assert.equal(g.state.players[0].cash, cash + offer.amount);
  assert.throws(
    () =>
      g.command(
        "a",
        { type: "sell", purchaseId: offer.purchaseId },
        g.state.serverNow,
      ),
    /no longer/,
  );
  assert.equal(g.state.players[0].cash, cash + offer.amount);
  const copied = g.snapshot();
  copied.players[0].cash = 999999;
  assert.equal(g.state.players[0].cash, cash + offer.amount);
  while (g.snapshot().phase !== "finished") g.tick(g.state.closesAt);
  const a = g.state.standings.find((p) => p.id === "a")!;
  assert.equal(a.collectionValue, 0);
  assert.equal(a.netWorth, cash + offer.amount);
  assert.equal(
    offer.amount,
    Math.round(a.purchases[0].appraisal!.value * 0.88),
  );
  const expired = room();
  expired.command(
    "a",
    { type: "bid", amount: 25, requestId: "expired-buy", round: 1 },
    4100,
  );
  expired.tick(expired.state.closesAt);
  expired.tick(expired.state.closesAt);
  expired.tick(expired.state.closesAt);
  expired.tick(expired.state.closesAt);
  expired.tick(expired.state.closesAt);
  const old = expired.privateState("a").offer!;
  expired.tick(old.expiresAt);
  assert.throws(
    () =>
      expired.command(
        "a",
        { type: "sell", purchaseId: old.purchaseId },
        old.expiresAt,
      ),
    /no longer/,
  );
  assert.equal(expired.state.players[0].cash, 4975);
});
test("a remaining human inherits hosting and disconnected finished seats do not block rematch", () => {
  const g = room();
  g.releasePlayer("a");
  assert.equal(g.state.hostId, "b");
  while (g.state.phase !== "finished") g.tick(g.state.closesAt);
  g.command("b", { type: "rematch" }, g.state.serverNow + 1);
  assert.equal(
    g.state.players.some((p) => p.id === "a"),
    false,
  );
  assert.ok(g.state.players.every((p) => p.cash === 5000 && !p.ready));
  for (const p of g.state.players)
    g.command(p.id, { type: "ready", ready: true }, g.state.serverNow);
  assert.doesNotThrow(() =>
    g.command("b", { type: "start" }, g.state.serverNow),
  );
});
test("seeded offline bot matches complete with legal wallets, distinct lots and accurate receipts", () => {
  for (let seed = 1; seed <= 12; seed++) {
    let value = seed;
    const random = () =>
      (value = (value * 1664525 + 1013904223) >>> 0) / 4294967296;
    const g = new Auction(
      `PRACTICE-${seed}`,
      "human",
      { ...settings, lots: 8, maxPlayers: 6 },
      "practice",
      random,
    );
    g.addPlayer("human", "Collector");
    for (let i = 1; i < 6; i++) g.addPlayer(`bot-${i}`, `Bot ${i}`, true);
    g.command("human", { type: "ready", ready: true }, 1000);
    g.command("human", { type: "start" }, 1000);
    let now = 1000;
    while (g.state.phase !== "finished" && now < 300000) {
      now += 250;
      g.tick(now);
      assert.ok(g.state.players.every((p) => p.cash >= 0 && p.cash <= 5000));
    }
    assert.equal(g.state.phase, "finished");
    const purchases = g.state.standings.flatMap((s) => s.purchases);
    assert.ok(purchases.length > 0);
    assert.equal(
      new Set(purchases.map((p) => p.item.id)).size,
      purchases.length,
    );
    for (const s of g.state.standings)
      assert.equal(
        s.netWorth,
        s.cash + s.purchases.reduce((n, p) => n + p.appraisal!.value, 0),
      );
  }
});
