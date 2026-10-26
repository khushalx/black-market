import { createAsset } from "../catalog";
import { InventoryDeck } from "../catalog/inventory";
import {
  defaultSettings,
  type Appraisal,
  type Asset,
  type Bid,
  type MarketCommand,
  type MarketSnapshot,
  type Participant,
  type PrivateState,
  type RoomSettings,
  type Standing,
} from "../shared/market";

export function validateSettings(
  input: Partial<RoomSettings> = {},
): RoomSettings {
  const s = { ...defaultSettings, ...input };
  const integer = (n: number, min: number, max: number) =>
    Number.isSafeInteger(n) && n >= min && n <= max;
  if (
    !integer(s.maxPlayers, 2, 6) ||
    ![5000, 15000, 50000].includes(s.budget) ||
    !integer(s.lots, 4, 12) ||
    !integer(s.previewSeconds, 3, 30) ||
    !integer(s.auctionSeconds, 5, 90) ||
    !integer(s.resultSeconds, 2, 15) ||
    !["private", "public"].includes(s.visibility) ||
    typeof s.bots !== "boolean"
  )
    throw new Error("Invalid room settings.");
  return s;
}

/** A serial command processor. Clock and hidden assets belong to its owner, never to a remote client. */
export class Auction {
  private inventory: InventoryDeck;
  private assets: Asset[] = [];
  private owned = new Map<string, Appraisal>();
  private secrets = new Map<string, PrivateState>();
  private requests = new Set<string>();
  private offered = new Set<string>();
  private departed = new Set<string>();
  private nextBot = 0;
  private sequence = 0;
  private serial = 0;
  startedAt = 0;
  state: MarketSnapshot;
  constructor(
    roomId: string,
    hostId: string,
    settings: Partial<RoomSettings> = {},
    mode: MarketSnapshot["mode"] = "private",
    private random = Math.random,
  ) {
    this.inventory = new InventoryDeck(random);
    this.state = {
      roomId,
      matchId: "",
      hostId,
      mode,
      settings: validateSettings(settings),
      phase: "lobby",
      round: 0,
      players: [],
      item: null,
      bid: null,
      bids: [],
      closesAt: 0,
      serverNow: Date.now(),
      extensions: 0,
      maxExtensions: 3,
      standings: [],
      message: "Waiting for collectors.",
      persistence: mode === "ranked" ? "pending" : "unranked",
    };
  }
  addPlayer(id: string, nickname: string, bot = false) {
    if (this.state.phase !== "lobby")
      throw new Error(
        "This match has already started. Reconnect with your reserved session.",
      );
    if (this.state.players.some((p) => p.id === id))
      throw new Error("You already have a seat in this room.");
    if (this.state.players.length >= this.state.settings.maxPlayers)
      throw new Error("Room is full.");
    this.state.players.push({
      id,
      nickname: nickname.slice(0, 24),
      cash: this.state.settings.budget,
      ready: bot,
      connected: true,
      bot,
      inspectionsLeft: 2,
      purchases: [],
    });
    this.secrets.set(id, { inspection: null, offer: null });
  }
  setConnected(id: string, value: boolean) {
    const p = this.player(id);
    p.connected = value;
    if (!value && this.state.phase === "lobby") p.ready = false;
    if (!value && this.state.hostId === id)
      this.state.hostId =
        this.state.players.find(
          (other) => other.id !== id && !other.bot && other.connected,
        )?.id ?? id;
  }
  removeLobbyPlayer(id: string) {
    if (this.state.phase !== "lobby") return;
    this.state.players = this.state.players.filter((p) => p.id !== id);
    this.secrets.delete(id);
    if (this.state.hostId === id)
      this.state.hostId =
        (
          this.state.players.find((p) => !p.bot && p.connected) ??
          this.state.players.find((p) => !p.bot)
        )?.id ?? "";
  }
  releasePlayer(id: string) {
    if (this.state.phase === "lobby") this.removeLobbyPlayer(id);
    else {
      this.setConnected(id, false);
      this.departed.add(id);
    }
  }
  private player(id: string) {
    const p = this.state.players.find((p) => p.id === id);
    if (!p) throw new Error("No authorized seat.");
    return p;
  }
  command(id: string, command: MarketCommand, now = Date.now()) {
    this.tick(now);
    const p = this.player(id);
    if (!p.connected) throw new Error("Reconnect before playing.");
    switch (command.type) {
      case "ready":
        if (this.state.phase !== "lobby")
          throw new Error("The lobby is closed.");
        p.ready = command.ready;
        break;
      case "start": {
        if (id !== this.state.hostId)
          throw new Error("Only the host can start.");
        if (this.state.phase !== "lobby")
          throw new Error("Match already started.");
        const humans = this.state.players.filter((p) => !p.bot && p.connected);
        if (
          humans.length <
          (this.state.mode === "practice" ||
          (this.state.mode === "private" && this.state.settings.bots)
            ? 1
            : 2)
        )
          throw new Error(
            "At least two connected human collectors are required.",
          );
        if (!this.state.players.every((p) => p.ready && p.connected))
          throw new Error("Every collector must be ready.");
        this.start(now);
        break;
      }
      case "bid":
        this.bid(p, command.amount, command.requestId, command.round, now);
        break;
      case "inspect":
        this.inspect(p);
        break;
      case "sell":
        this.sell(p, command.purchaseId, now);
        break;
      case "rematch": {
        if (id !== this.state.hostId || this.state.phase !== "finished")
          throw new Error("Only the host can reopen a finished room.");
        if (this.state.persistence === "pending")
          throw new Error("Saving results. Please wait.");
        this.state.players = this.state.players.filter(
          (player) => !this.departed.has(player.id),
        );
        this.departed.clear();
        for (const player of this.state.players) {
          player.cash = this.state.settings.budget;
          player.purchases = [];
          player.ready = player.bot;
          player.inspectionsLeft = 2;
          this.secrets.set(player.id, { inspection: null, offer: null });
        }
        this.state.phase = "lobby";
        this.state.round = 0;
        this.state.item = null;
        this.state.bid = null;
        this.state.bids = [];
        this.state.standings = [];
        this.state.closesAt = 0;
        this.state.message =
          "Rematch room open. Ready up for equal fresh wallets.";
        break;
      }
    }
  }
  private start(now: number) {
    this.startedAt = now;
    this.serial++;
    this.state.matchId = `${this.state.roomId}-${now}-${this.serial}`;
    this.assets = this.inventory
      .draw(this.state.settings.lots, this.state.settings.budget)
      .map((item, index) => createAsset(item, this.random, this.state.matchId + ":lot:" + (index + 1)));
    this.owned.clear();
    this.requests.clear();
    this.offered.clear();
    this.state.persistence =
      this.state.mode === "ranked" ? "pending" : "unranked";
    this.state.standings = [];
    this.state.round = 0;
    this.nextLot(now);
  }
  private nextLot(now: number) {
    this.state.round++;
    this.state.item = this.assets[this.state.round - 1].item;
    this.state.bid = null;
    this.state.bids = [];
    this.state.extensions = 0;
    this.state.phase = "preview";
    this.state.closesAt = now + this.state.settings.previewSeconds * 1000;
    this.state.message =
      "Preview the condition and references. Two private inspections per match.";
    for (const p of this.state.players) {
      const secret = this.secrets.get(p.id)!;
      secret.inspection = null;
      secret.offer = null;
      if ([3, 5, 7].includes(this.state.round)) {
        const purchase = p.purchases.find(
          (v) => v.soldFor === undefined && !this.offered.has(v.id),
        );
        if (purchase) {
          this.offered.add(purchase.id);
          secret.offer = {
            purchaseId: purchase.id,
            name: `${purchase.item.brand} ${purchase.item.model}`,
            amount: Math.round(this.owned.get(purchase.id)!.value * 0.88),
            expiresAt: this.state.closesAt,
          };
        }
      }
    }
    this.nextBot = now + 1500;
  }
  private bid(
    p: Participant,
    amount: number,
    requestId: string,
    round: number,
    now: number,
  ) {
    if (this.state.phase !== "auction" || now >= this.state.closesAt)
      throw new Error("Bidding is closed.");
    if (round !== this.state.round)
      throw new Error("This bid belongs to an earlier lot.");
    if (
      typeof requestId !== "string" ||
      requestId.length < 4 ||
      requestId.length > 100
    )
      throw new Error("Invalid bid request.");
    const key = `${p.id}:${requestId}`;
    if (this.requests.has(key))
      throw new Error("This bid request was already processed.");
    if (p.id === this.state.bid?.playerId)
      throw new Error("You are already leading.");
    const minimum = (this.state.bid?.amount ?? 0) + 25;
    if (!Number.isSafeInteger(amount) || amount < minimum)
      throw new Error(`Bid at least $${minimum}. Whole dollars only.`);
    if (amount > p.cash)
      throw new Error("This bid exceeds your available cash.");
    this.requests.add(key);
    const bid: Bid = {
      sequence: ++this.sequence,
      playerId: p.id,
      nickname: p.nickname,
      amount,
      at: now,
    };
    this.state.bid = bid;
    this.state.bids.push(bid);
    this.state.message = `${p.nickname} bid $${amount.toLocaleString("en-US")}.`;
    if (
      this.state.closesAt - now <= 5000 &&
      this.state.extensions < this.state.maxExtensions
    ) {
      this.state.closesAt += 5000;
      this.state.extensions++;
      this.state.message += " Late bid: 5 seconds added.";
    }
  }
  private inspect(p: Participant) {
    if (!["preview", "auction"].includes(this.state.phase))
      throw new Error("Inspect during preview or bidding.");
    const secret = this.secrets.get(p.id)!;
    if (secret.inspection) return;
    if (p.inspectionsLeft <= 0)
      throw new Error("Both inspection opportunities have been used.");
    p.inspectionsLeft--;
    const appraisal = this.assets[this.state.round - 1].appraisal;
    secret.inspection = {
      itemId: this.state.item!.id,
      fact: appraisal.inspection,
      range: [
        Math.round((appraisal.value * 0.9) / 5) * 5,
        Math.round((appraisal.value * 1.1) / 5) * 5,
      ],
      certainty:
        "Verified object facts. Value interval is indicative, not a guaranteed sale price.",
    };
  }
  private sell(p: Participant, purchaseId: string, now: number) {
    const secret = this.secrets.get(p.id)!;
    const offer = secret.offer;
    if (
      this.state.phase !== "preview" ||
      !offer ||
      offer.purchaseId !== purchaseId ||
      offer.expiresAt <= now
    )
      throw new Error("Dealer offer is no longer available.");
    const purchase = p.purchases.find(
      (v) => v.id === purchaseId && v.soldFor === undefined,
    );
    if (!purchase) throw new Error("You do not own this available item.");
    purchase.soldFor = offer.amount;
    p.cash += offer.amount;
    secret.offer = null;
    this.state.message = `${p.nickname} accepted a dealer offer for $${offer.amount}.`;
  }
  tick(now = Date.now()) {
    this.state.serverNow = now;
    if (["lobby", "finished"].includes(this.state.phase)) return;
    if (now >= this.state.closesAt) {
      if (this.state.phase === "preview") {
        this.state.phase = "auction";
        this.state.closesAt = now + this.state.settings.auctionSeconds * 1000;
        this.state.message =
          "Auction open. Every accepted bid is a binding fictional-dollar offer.";
        for (const secret of this.secrets.values()) secret.offer = null;
      } else if (this.state.phase === "auction") this.settleLot(now);
      else if (this.state.phase === "sold") {
        if (this.state.round >= this.state.settings.lots) this.finish();
        else this.nextLot(now);
      }
    }
    if (this.state.phase === "auction" && now >= this.nextBot)
      this.botTurn(now);
  }
  private botTurn(now: number) {
    this.nextBot = now + 800 + Math.floor(this.random() * 1800);
    const bots = this.state.players.filter(
      (p) =>
        p.bot &&
        p.id !== this.state.bid?.playerId &&
        p.cash >= (this.state.bid?.amount ?? 0) + 25,
    );
    if (!bots.length) return;
    const p = bots[Math.floor(this.random() * bots.length)];
    const index = this.state.players.indexOf(p);
    const ref = this.state.item!.referenceValue;
    const willingness = ref * (0.55 + (index % 4) * 0.13 + this.random() * 0.2);
    const amount =
      (this.state.bid?.amount ?? 0) +
      [25, 50, 100][Math.floor(this.random() * 3)];
    if (amount <= Math.min(p.cash, willingness) && this.random() > 0.12)
      this.bid(p, amount, `bot-${++this.serial}`, this.state.round, now);
  }
  private settleLot(now: number) {
    if (this.state.phase !== "auction") return;
    if (this.state.bid) {
      const winner = this.player(this.state.bid.playerId);
      const asset = this.assets[this.state.round - 1];
      winner.cash -= this.state.bid.amount;
      const id = `${this.state.matchId}:${this.state.round}`;
      winner.purchases.push({
        id,
        item: asset.item,
        paid: this.state.bid.amount,
      });
      this.owned.set(id, asset.appraisal);
      this.state.message = `Sold to ${winner.nickname} for $${this.state.bid.amount.toLocaleString("en-US")}. Final appraisal stays sealed.`;
    } else this.state.message = "No bids. This lot returns to inventory.";
    this.state.phase = "sold";
    this.state.closesAt = now + this.state.settings.resultSeconds * 1000;
  }
  private finish() {
    this.state.phase = "finished";
    this.state.closesAt = 0;
    this.state.standings = this.state.players
      .map((p) => {
        const purchases = p.purchases.map((v) => ({
          ...v,
          appraisal: this.owned.get(v.id),
        }));
        const collectionValue = purchases.reduce(
          (n, v) => n + (v.soldFor === undefined ? v.appraisal!.value : 0),
          0,
        );
        const profit = p.cash + collectionValue - this.state.settings.budget;
        const spend = purchases.reduce((n, v) => n + v.paid, 0);
        return {
          id: p.id,
          nickname: p.nickname,
          cash: p.cash,
          collectionValue,
          netWorth: p.cash + collectionValue,
          profit,
          returnPercent: spend ? (profit / spend) * 100 : 0,
          purchases,
        } satisfies Standing;
      })
      .sort(
        (a, b) =>
          b.netWorth - a.netWorth ||
          b.cash - a.cash ||
          a.id.localeCompare(b.id),
      );
    this.state.message =
      "Appraisals revealed. Wealth equals remaining cash plus held assets.";
  }
  snapshot(): MarketSnapshot {
    return structuredClone(this.state);
  }
  privateState(id: string): PrivateState {
    this.player(id);
    return structuredClone(this.secrets.get(id)!);
  }
}
