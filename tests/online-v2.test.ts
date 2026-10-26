import test from "node:test";
import assert from "node:assert/strict";
import { Client, type Room } from "@colyseus/sdk";
import {
  createGuest,
  closePersistence,
  getProfile,
} from "../server/persistence";
import type {
  MarketSnapshot,
  PrivateState,
  MarketCommand,
} from "../src/shared/market";
const endpoint = process.env.TEST_SERVER ?? "http://127.0.0.1:2567";
async function waitFor(fn: () => boolean, timeout = 20000) {
  const end = Date.now() + timeout;
  while (!fn()) {
    if (Date.now() > end)
      throw new Error("Timed out waiting for synchronized state");
    await new Promise((r) => setTimeout(r, 25));
  }
}
async function request(path: string, token: string, body?: unknown) {
  const response = await fetch(`${endpoint}/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Cookie: `bm_session=${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
type Seat = {
  room: Room;
  s: MarketSnapshot | null;
  private: PrivateState | null;
  errors: string[];
};
function observe(room: Room): Seat {
  const seat: Seat = { room, s: null, private: null, errors: [] };
  room.onMessage("snapshot", (s) => {
    seat.s = s;
  });
  room.onMessage("private", (s) => {
    seat.private = s;
  });
  room.onMessage("error", (e) => seat.errors.push(e));
  room.send("sync");
  return seat;
}
const send = (s: Seat, command: MarketCommand) =>
  s.room.send("command", command);

test(
  "four independent live clients complete eight lots, private inspections, reconnect and a full rematch",
  { skip: process.env.ONLINE_TEST !== "1", timeout: 280000 },
  async () => {
    const guests = await Promise.all(
      [0, 1, 2, 3].map((i) =>
        createGuest(
          `Socket QA ${i}`,
          `qa-device-${Date.now()}-${i}`,
          "qa-network",
        ),
      ),
    );
    const tickets = await Promise.all(
      guests.map((g) => request("ticket", g.sessionToken, {})),
    );
    const clients = guests.map(() => new Client(endpoint));
    const seats: Seat[] = [];
    try {
      const room = await clients[0].create("auction", {
        ticket: tickets[0].ticket,
        settings: {
          maxPlayers: 4,
          lots: 8,
          previewSeconds: 3,
          auctionSeconds: 6,
          resultSeconds: 2,
        },
      });
      seats.push(observe(room));
      for (let i = 1; i < 4; i++)
        seats.push(
          observe(
            await clients[i].joinById(room.roomId, {
              ticket: tickets[i].ticket,
            }),
          ),
        );
      await waitFor(() => seats.every((s) => s.s?.players.length === 4));
      assert.ok(seats.every((s) => s.s?.players.every((p) => p.cash === 5000)));
      await assert.rejects(() =>
        new Client(endpoint).joinById(room.roomId, { ticket: "forged" }),
      );
      seats.forEach((s) => send(s, { type: "ready", ready: true }));
      await waitFor(() =>
        seats.every((s) => s.s?.players.every((p) => p.ready)),
      );
      send(seats[0], { type: "start" });
      await waitFor(() => seats.every((s) => s.s?.phase === "preview"));
      send(seats[0], { type: "inspect" });
      await waitFor(() => !!seats[0].private?.inspection);
      assert.equal(seats[1].private?.inspection, null);
      const fact = seats[0].private!.inspection!.fact;
      assert.ok(seats.every((s) => !JSON.stringify(s.s).includes(fact)));
      assert.ok(
        seats.every((s) => !JSON.stringify(s.s).includes('"appraisal"')),
      );
      await assert.rejects(() =>
        new Client(endpoint).joinById(room.roomId, {
          ticket: tickets[0].ticket,
        }),
      );
      await waitFor(() => seats[0].s?.phase === "auction");
      send(seats[0], {
        type: "bid",
        amount: 250,
        requestId: "race-a",
        round: 1,
      });
      send(seats[1], {
        type: "bid",
        amount: 250,
        requestId: "race-b",
        round: 1,
      });
      await waitFor(() => seats.every((s) => s.s?.bid?.amount === 250));
      await waitFor(
        () => seats[0].errors.length + seats[1].errors.length === 1,
      );
      assert.equal(seats[0].s!.bids.length, 1);
      assert.ok(
        seats.every((s) => s.s?.bid?.playerId === seats[0].s?.bid?.playerId),
      );
      send(seats[2], {
        type: "bid",
        amount: 5001,
        requestId: "over-budget",
        round: 1,
      });
      await waitFor(() => seats[2].errors.length > 0);
      assert.match(seats[2].errors.at(-1)!, /cash/);
      // Override only SDK retry backoff thresholds for this test; no server clock or auction rule changes.
      seats[3].room.reconnection.minUptime = 0;
      // A genuine WebSocket drop is recovered by Colyseus without creating a new identity or wallet.
      seats[3].room.connection.close(4010, "QA reconnectable drop");
      await waitFor(
        () =>
          seats[0].s?.players.find((p) => p.id === guests[3].profile.id)
            ?.connected === false,
      );
      await waitFor(
        () =>
          seats[0].s?.players.find((p) => p.id === guests[3].profile.id)
            ?.connected === true,
        15000,
      );
      for (let round = 2; round <= 8; round++) {
        await waitFor(
          () => seats[0].s?.round === round && seats[0].s.phase === "auction",
          30000,
        );
        const seat = seats[round % 4];
        send(seat, {
          type: "bid",
          amount: 100 + round * 25,
          requestId: `lot-${round}`,
          round,
        });
        await waitFor(() =>
          seats.every((s) => s.s?.bid?.amount === 100 + round * 25),
        );
      }
      await waitFor(() => seats.every((s) => s.s?.phase === "finished"), 30000);
      await waitFor(() => seats[0].s?.persistence === "saved");
      const final = seats[0].s!;
      const firstModels = new Set(final.standings.flatMap(s => s.purchases.map(p => p.item.id)));
      const firstInstances = new Set(final.standings.flatMap(s => s.purchases.map(p => p.item.lot?.instanceId)));
      assert.equal(firstModels.size,8);
      assert.equal(firstInstances.size,8);
      assert.ok(!firstInstances.has(undefined));
      assert.equal(final.standings.length, 4);
      assert.equal(
        final.standings.reduce((n, s) => n + s.purchases.length, 0),
        8,
      );
      for (const s of final.standings) {
        assert.equal(
          s.netWorth,
          s.cash +
            s.purchases
              .filter((p) => p.soldFor === undefined)
              .reduce((n, p) => n + p.appraisal!.value, 0),
        );
        assert.equal(s.profit, s.netWorth - 5000);
      }
      const history = await request("history", guests[0].sessionToken);
      assert.equal(history[0].id, final.matchId);
      assert.deepEqual(history[0].standings,final.standings);
      assert.equal(
        (await getProfile(guests[0].profile.id))!.matches,
        0,
        "Private matches never award ranked progression",
      );
      send(seats[0], { type: "rematch" });
      await waitFor(() => seats.every((s) => s.s?.phase === "lobby"));
      assert.ok(
        seats.every((s) =>
          s.s?.players.every(
            (p) =>
              p.cash === 5000 &&
              p.purchases.length === 0 &&
              p.inspectionsLeft === 2,
          ),
        ),
      );
      seats.forEach((s) => send(s, { type: "ready", ready: true }));
      await waitFor(() =>
        seats.every((s) => s.s?.players.every((p) => p.ready)),
      );
      send(seats[0], { type: "start" });
      await waitFor(() => seats.every((s) => s.s?.phase === "preview"));
      assert.notEqual(seats[0].s!.matchId, final.matchId);
      for (let round = 1; round <= 8; round++) {
        await waitFor(
          () => seats[0].s?.round === round && seats[0].s.phase === "auction",
          30000,
        );
        send(seats[(round + 1) % 4], {
          type: "bid",
          amount: 75,
          requestId: `rematch-${round}`,
          round,
        });
        await waitFor(() => seats.every((s) => s.s?.bid?.amount === 75));
      }
      await waitFor(
        () =>
          seats.every(
            (s) => s.s?.phase === "finished" && s.s.persistence === "saved",
          ),
        30000,
      );
      assert.equal(
        seats[0].s!.standings.reduce((n, s) => n + s.purchases.length, 0),
        8,
      );
      for(const purchase of seats[0].s!.standings.flatMap(s=>s.purchases)) {
        assert.ok(!firstModels.has(purchase.item.id),"Rematch repeated an unexhausted model");
        assert.ok(purchase.item.lot?.instanceId);
        assert.ok(!firstInstances.has(purchase.item.lot?.instanceId));
      }
      assert.equal(
        (await request("history", guests[0].sessionToken)).length,
        2,
      );
      assert.equal((await getProfile(guests[0].profile.id))!.matches, 0);
    } finally {
      await Promise.all(
        seats.map((s) =>
          s.room.connection.isOpen ? s.room.leave() : Promise.resolve(),
        ),
      );
      await closePersistence();
    }
  },
);
