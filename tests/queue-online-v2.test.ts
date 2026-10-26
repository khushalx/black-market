import test, { after } from "node:test";
import assert from "node:assert/strict";
import { Client, type Room } from "@colyseus/sdk";
import {
  createGuest,
  closePersistence,
  getProfile,
} from "../server/persistence";
import { progressionDelta } from "../server/progression";
import type { MarketSnapshot } from "../src/shared/market";
const endpoint = process.env.TEST_SERVER ?? "http://127.0.0.1:2567";
after(async () => {
  if (process.env.QUEUE_TEST === "1") await closePersistence();
});
async function waitFor(fn: () => boolean, timeout = 35000) {
  const end = Date.now() + timeout;
  while (!fn()) {
    if (Date.now() > end) throw new Error("Timed out waiting for ranked state");
    await new Promise((r) => setTimeout(r, 30));
  }
}
async function api(path: string, token: string, body?: unknown) {
  const r = await fetch(`${endpoint}/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Cookie: `bm_session=${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  return d;
}
test(
  "public queue ignores forged tiers, forms equal wallets, records ranked progression once",
  { skip: process.env.QUEUE_TEST !== "1", timeout: 480000 },
  async () => {
    const guests = await Promise.all(
      [0, 1, 2].map((i) =>
        createGuest(
          `Ranked QA ${i}`,
          `rank-device-${Date.now()}-${i}`,
          "same-nat",
        ),
      ),
    );
    const rooms: Room[] = [];
    const states: (MarketSnapshot | null)[] = [null, null, null];
    try {
      const queues = await Promise.all(
        guests.map((g) =>
          api("queue", g.sessionToken, {
            tier: "high-roller",
            bankroll: 50000,
            rating: 3000,
          }),
        ),
      );
      assert.ok(queues.every((q) => q.tier === "starter"));
      let matches: { roomId?: string }[] = [];
      const until = Date.now() + 20000;
      while (!matches.length || matches.some((q) => !q.roomId)) {
        if (Date.now() > until) throw new Error("Queue did not create a room");
        matches = await Promise.all(
          guests.map((g) => api("queue", g.sessionToken, {})),
        );
        await new Promise((r) => setTimeout(r, 200));
      }
      assert.ok(matches.every((q) => q.roomId === matches[0].roomId));
      const reservedTicket=await api("ticket",guests[0].sessionToken,{});
      await assert.rejects(()=>new Client(endpoint).create("auction",{ticket:reservedTicket.ticket}),/active|reserved/);
      for (let i = 0; i < 3; i++) {
        const t = await api("ticket", guests[i].sessionToken, {});
        const room = await new Client(endpoint).joinById(matches[i].roomId!, {
          ticket: t.ticket,
        });
        rooms.push(room);
        room.onMessage("snapshot", (s) => (states[i] = s));
        room.onMessage("private", () => {});
        room.onMessage("error", (e) => {
          throw new Error(e);
        });
        room.send("sync");
      }
      await waitFor(() => states.every((s) => s?.players.length === 3));
      assert.ok(
        states.every(
          (s) =>
            s?.settings.budget === 5000 &&
            s.players.every((p) => p.cash === 5000 && !p.bot),
        ),
      );
      rooms.forEach((r) => r.send("command", { type: "ready", ready: true }));
      for (let round = 1; round <= 8; round++) {
        await waitFor(
          () => states[0]?.round === round && states[0].phase === "auction",
          120000,
        );
        rooms[round % 3].send("command", {
          type: "bid",
          amount: 100 + round * 25,
          requestId: `rank-${round}`,
          round,
        });
        await waitFor(() =>
          states.every((s) => s?.bid?.amount === 100 + round * 25),
        );
      }
      await waitFor(() => states.every((s) => s?.phase === "finished"), 120000);
      await waitFor(() => states[0]?.persistence === "saved");
      const results = states[0]!.standings;
      for (const g of guests) {
        const p = (await getProfile(g.profile.id))!;
        const result = results.find((s) => s.id === p.id)!;
        assert.equal(p.matches, 1);
        assert.equal(p.bankroll, 5000 + progressionDelta(result.profit, 5000));
        assert.ok(p.rating >= 100 && p.rating <= 3000);
        const history = await api("history", g.sessionToken);
        assert.equal(history[0].id, states[0]!.matchId);
      }
      await new Promise((r) => setTimeout(r, 750));
      assert.ok(
        (await Promise.all(guests.map((g) => getProfile(g.profile.id)))).every(
          (p) => p?.matches === 1,
        ),
      );
    } finally {
      await Promise.all(
        rooms.map((r) => (r.connection.isOpen ? r.leave() : Promise.resolve())),
      );
    }
  },
);
test(
  "ranked ready-up timeout starts two humans when the assigned host never arrives",
  { skip: process.env.QUEUE_TEST !== "1", timeout: 75000 },
  async () => {
    const guests = await Promise.all(
      [0, 1, 2].map((i) =>
        createGuest(
          `Absent seat QA ${i}`,
          `absent-device-${Date.now()}-${i}`,
          "same-nat",
        ),
      ),
    );
    const rooms: Room[] = [];
    const states: (MarketSnapshot | null)[] = [null, null];
    try {
      let matches: { roomId?: string }[] = [];
      const deadline = Date.now() + 15000;
      while (matches.length !== 3 || matches.some((s) => !s.roomId)) {
        if (Date.now() > deadline)
          throw new Error("Queue did not allocate the partial table");
        matches = await Promise.all(
          guests.map((g) => api("queue", g.sessionToken, {})),
        );
        await new Promise((r) => setTimeout(r, 200));
      }
      await api("queue/cancel",guests[0].sessionToken,{});
      const cancelledTicket=await api("ticket",guests[0].sessionToken,{});
      await assert.rejects(()=>new Client(endpoint).joinById(matches[0].roomId!,{ticket:cancelledTicket.ticket}),/reservation|valid/);
      for (let i = 0; i < 2; i++) {
        const ticket = await api("ticket", guests[i + 1].sessionToken, {});
        const room = await new Client(endpoint).joinById(
          matches[i + 1].roomId!,
          { ticket: ticket.ticket },
        );
        rooms.push(room);
        room.onMessage("snapshot", (s) => (states[i] = s));
        room.onMessage("private", () => {});
        room.onMessage("error", () => {});
        room.send("sync");
      }
      await waitFor(() => states.every((s) => s?.players.length === 2));
      rooms.forEach((r) => r.send("command", { type: "ready", ready: true }));
      await waitFor(() =>
        states.every((s) => s?.players.every((p) => p.ready)),
      );
      assert.equal(states[0]!.phase, "lobby");
      await waitFor(
        () =>
          states.every((s) => s?.phase === "preview" || s?.phase === "auction"),
        55000,
      );
      assert.equal(states[0]!.players.length, 2);
      assert.ok(
        states[0]!.players.every(
          (p) => !p.bot && p.connected && p.cash === 5000,
        ),
      );
      assert.notEqual(states[0]!.hostId, guests[0].profile.id);
    } finally {
      await Promise.all(
        rooms.map((r) => (r.connection.isOpen ? r.leave() : Promise.resolve())),
      );
    }
  },
);
