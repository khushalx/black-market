import { Room, type Client, type AuthContext } from "@colyseus/core";
import { Schema } from "@colyseus/schema";
import { z } from "zod";
import { Auction, validateSettings } from "../src/domain/auction";
import type { MarketCommand, RoomSettings } from "../src/shared/market";
import { getIdentityRisk, getProfile, settleMatch } from "./persistence";
import { internalSecret, verifyTicket } from "./auth";
import { tierBudget } from "./matchmaking";
import { tierForBankroll } from "./progression";
import { config, originAllowed } from "./config";
import { logError, roomLimits } from "./security";
import { activePlayers, rankedReservations, releaseRankedReservation, releaseRoomCode, reserveRoomCode } from "./seats";
export { activePlayers } from "./seats";

const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), ready: z.boolean() }).strict(),
  z.object({ type: z.literal("start") }).strict(),
  z
    .object({
      type: z.literal("bid"),
      amount: z.number().int().positive().max(1000000),
      requestId: z.string().min(4).max(100),
      round: z.number().int().min(1).max(12),
    })
    .strict(),
  z.object({ type: z.literal("inspect") }).strict(),
  z
    .object({ type: z.literal("sell"), purchaseId: z.string().max(200) })
    .strict(),
  z.object({ type: z.literal("rematch") }).strict(),
]);
export class AuctionRoom extends Room {
  state = new Schema();
  game!: Auction;
  private allowed: string[] = [];
  private saving = false;
  private saved = "";
  private lastPersist = 0;
  private rate = new Map<string, { at: number; count: number }>();
  private persistenceTask: Promise<void> | null = null;
  private dropped = new Set<string>();
  async onCreate(options: {
    ticket?: string;
    settings?: Partial<RoomSettings>;
    internal?: string;
    allowed?: string[];
    ranked?: boolean;
  }) {
    const ranked = options.ranked === true;
    if (ranked && options.internal !== internalSecret)
      throw new Error("Ranked rooms are created by the matchmaking service.");
    // Assigned players may arrive in any order. A rejected/cancelled first join
    // must not dispose the table while the other legitimate seats are arriving.
    if(ranked) this.autoDispose=false;
    const host = ranked ? options.allowed?.[0] : verifyTicket(options.ticket);
    if (!host) throw new Error("Missing room host.");
    if (!ranked) {
      roomLimits.take(`create:${host}`,10,60000);
      if(activePlayers.has(host) || rankedReservations.has(host)) throw new Error("You already have an active or reserved room.");
    }
    const profile = await getProfile(host);
    if (!profile) throw new Error("Unknown guest.");
    this.allowed = ranked ? (options.allowed ?? []) : [];
    const settings = ranked
      ? validateSettings({
          budget: tierBudget(tierForBankroll(profile.bankroll)),
          visibility: "public",
          bots: false,
          previewSeconds: config.timings[0],
          auctionSeconds: config.timings[1],
          resultSeconds: config.timings[2],
        })
      : validateSettings(options.settings);
    this.roomId = reserveRoomCode();
    this.maxClients = settings.maxPlayers;
    await this.setPrivate(settings.visibility === "private" || ranked);
    await this.setMetadata({
      visibility: settings.visibility,
      ranked,
      budget: settings.budget,
    });
    this.game = new Auction(
      this.roomId,
      host,
      settings,
      ranked ? "ranked" : "private",
    );
    if (ranked) {
      this.game.state.message =
        "Ready up within 45 seconds. The match needs at least two ready, connected humans.";
      this.clock.setTimeout(() => {
        if (this.game.state.phase !== "lobby") return;
        const ready = this.game.state.players.filter(
          (p) => p.ready && p.connected && !p.bot,
        );
        if (ready.length < 2) {
          for (const client of this.clients)
            client.send(
              "error",
              "This table did not receive two ready collectors. Return to matchmaking.",
            );
          void this.disconnect();
          return;
        }
        const ids = new Set(ready.map((p) => p.id));
        for (const p of [...this.game.state.players])
          if (!ids.has(p.id)) this.game.removeLobbyPlayer(p.id);
        for(const id of this.allowed) if(!ids.has(id)) releaseRankedReservation(id,this.roomId);
        this.allowed = ready.map((p) => p.id);
        this.game.state.hostId = ready[0].id;
        for (const client of this.clients)
          if (!ids.has(client.auth.id)) {
            client.send(
              "error",
              "Your ready-up window expired. Return to matchmaking.",
            );
            client.leave();
          }
        this.game.command(this.game.state.hostId, { type: "start" });
        void this.lock();
        this.publish();
      }, 45000);
    }
    this.onMessage("command", (client, payload) => {
      try {
        const now = Date.now();
        const rate = this.rate.get(client.sessionId);
        if (rate && now - rate.at < 1000) {
          if (++rate.count > 12)
            throw new Error("Too many actions. Please slow down.");
        } else this.rate.set(client.sessionId, { at: now, count: 1 });
        const cmd = commandSchema.parse(payload) as MarketCommand;
        if(cmd.type==="start" && this.game.state.mode==="ranked") throw Error("Ranked tables start automatically when their ready-up conditions are met.");
        if (
          cmd.type === "rematch" &&
          (this.game.state.mode === "ranked" ||
            this.saving ||
            this.saved !== this.game.state.matchId)
        )
          throw new Error(
            this.game.state.mode === "ranked"
              ? "Return to matchmaking for another ranked match."
              : "Waiting for the authoritative result to save.",
          );
        if (
          cmd.type === "start" &&
          this.game.state.settings.bots &&
          this.game.state.mode !== "ranked"
        ) {
          if (
            client.auth.id !== this.game.state.hostId ||
            this.game.state.phase !== "lobby"
          )
            throw new Error("Only the lobby host can add practice opponents.");
          while (
            this.game.state.players.length < this.game.state.settings.maxPlayers
          ) {
            const n = this.game.state.players.length;
            this.game.addPlayer(
              `bot-${n}`,
              ["Alex", "Morgan", "Jamie", "Robin", "Sam", "Drew"][n],
              true,
            );
          }
        }
        this.game.command(client.auth.id, cmd);
        if (
          cmd.type === "ready" &&
          this.game.state.mode === "ranked" &&
          this.game.state.players.length === this.allowed.length &&
          this.game.state.players.every((p) => p.ready && p.connected)
        ) {
          this.game.command(this.game.state.hostId, { type: "start" });
          void this.lock();
        }
        if (cmd.type === "start") void this.lock();
        if (cmd.type === "rematch") void this.unlock();
        this.publish();
      } catch (error) {
        client.send(
          "error",
          error instanceof z.ZodError
            ? "Invalid game action."
            : error instanceof Error
              ? error.message
              : "Action rejected.",
        );
      }
    });
    this.onMessage("sync", (client) => {
      try {
        roomLimits.take(`sync:${client.sessionId}`,4,1000);
        this.publish(client);
      } catch { /* Repeated sync requests do not amplify broadcasts. */ }
    });
    this.onMessage("time",(client,payload)=>{
      if(!Number.isSafeInteger(payload?.id) || payload.id<0) return;
      try {roomLimits.take(`time:${client.sessionId}`,4,1000);client.send("time",{id:payload.id,serverNow:Date.now()});}catch{}
    });
    this.clock.setInterval(() => {
      this.game.tick();
      if (
        this.game.state.phase === "finished" &&
        this.saved !== this.game.state.matchId &&
        this.game.state.persistence === "unranked"
      )
        this.game.state.persistence = "pending";
      this.publish();
      if(!this.persistenceTask) {
        this.persistenceTask=this.persist().finally(()=>{this.persistenceTask=null;});
      }
    }, 250);
  }
  async onAuth(_client: Client, options: { ticket?: string }, context: AuthContext) {
    if(!originAllowed(context.headers.get("origin") ?? undefined)) throw Error("Unrecognized request origin.");
    const id = verifyTicket(options.ticket);
    roomLimits.take(`join:${id}`,30,60000);
    const profile = await getProfile(id);
    if (!profile) throw new Error("Your guest session no longer exists.");
    if (this.game.state.phase !== "lobby")
      throw new Error(
        "Match in progress. Use your reserved reconnection session.",
      );
    if (this.allowed.length && !this.allowed.includes(id))
      throw new Error("This ranked seat belongs to another collector.");
    if (activePlayers.has(id))
      throw new Error(
        "This identity is already in a room. Return to that room or leave it first.",
      );
    if(rankedReservations.has(id) && rankedReservations.get(id)!==this.roomId) throw Error("You already have a reserved ranked table. Cancel matchmaking first.");
    if(this.game.state.mode==="ranked" && rankedReservations.get(id)!==this.roomId) throw Error("This ranked reservation is no longer valid. Rejoin matchmaking.");
    if (
      this.game.state.mode === "ranked" &&
      tierBudget(tierForBankroll(profile.bankroll)) !==
        this.game.state.settings.budget
    )
      throw new Error("Your bankroll tier changed. Rejoin matchmaking.");
    return { id, nickname: profile.nickname };
  }
  onJoin(client: Client) {
    const id = client.auth.id;
    if (activePlayers.has(id))
      throw new Error("Identity already has an active seat.");
    this.game.addPlayer(id, client.auth.nickname);
    activePlayers.set(id, this.roomId);
    this.publish();
  }
  async onDrop(client: Client) {
    if(!this.game.state.players.some(p=>p.id===client.auth.id)) return;
    this.dropped.add(client.auth.id);
    this.game.setConnected(client.auth.id, false);
    this.publish();
    try {
      await this.allowReconnection(client, config.reconnectSeconds);
    } catch {
      /* onLeave handles expired seats */
    }
  }
  onReconnect(client: Client) {
    this.dropped.delete(client.auth.id);
    this.game.setConnected(client.auth.id, true);
    this.publish();
  }
  onLeave(client: Client) {
    const id = client.auth.id;
    this.dropped.delete(id);
    if (this.game.state.phase === "lobby" || (this.game.state.phase === "finished" && this.saved===this.game.state.matchId)) {
      if (activePlayers.get(id) === this.roomId) activePlayers.delete(id);
      releaseRankedReservation(id,this.roomId);
    }
    this.rate.delete(client.sessionId);
    if (this.game.state.players.some((p) => p.id === id)) {
      this.game.releasePlayer(id);
    }
    this.publish();
    if(this.game.state.phase==="finished" && this.saved===this.game.state.matchId && !this.clients.length && !this.dropped.size) void this.disconnect();
  }
  async onDispose() {
    await this.persistenceTask;
    // On a controlled shutdown, finish saving an already completed result.
    if(this.game?.state.phase==="finished") await this.persist();
    releaseRoomCode(this.roomId);
    for(const id of this.allowed) releaseRankedReservation(id,this.roomId);
    for (const p of this.game?.state.players ?? [])
      if (activePlayers.get(p.id) === this.roomId) activePlayers.delete(p.id);
  }
  private publish(only?: Client) {
    this.autoDispose=this.game.state.phase==="lobby" && this.game.state.mode!=="ranked";
    const publicState = this.game.snapshot();
    for (const client of only ? [only] : this.clients) {
      if(!publicState.players.some(p=>p.id===client.auth.id)) continue;
      client.send("snapshot", publicState);
      client.send("private", this.game.privateState(client.auth.id));
    }
  }
  private async persist() {
    if (
      this.game.state.phase !== "finished" ||
      this.saving ||
      this.saved === this.game.state.matchId ||
      Date.now() - this.lastPersist < 5000
    )
      return;
    this.saving = true;
    this.lastPersist = Date.now();
    const s = this.game.snapshot();
    try {
      const humanIds = s.players.filter((p) => !p.bot).map((p) => p.id);
      const risk =
        s.mode === "ranked" ? await getIdentityRisk(humanIds) : false;
      const recorded = await settleMatch({
        id: s.matchId,
        mode: s.mode,
        budget: s.settings.budget,
        standings: s.standings,
        startedAt: new Date(this.game.startedAt).toISOString(),
        endedAt: new Date().toISOString(),
        rankedEligible:
          s.mode === "ranked" &&
          !risk &&
          humanIds.length >= 2 &&
          !s.players.some((p) => p.bot),
      });
      this.saved = s.matchId;
      this.game.state.persistence = "saved";
      for(const player of s.players) if(!this.clients.some(c=>c.auth.id===player.id) && !this.dropped.has(player.id)) {
        if(activePlayers.get(player.id)===this.roomId) activePlayers.delete(player.id);
        releaseRankedReservation(player.id,this.roomId);
      }
      if(!this.clients.length && !this.dropped.size) void this.disconnect();
      if (s.mode === "ranked" && !recorded.rankedApplied)
        this.game.state.message +=
          " Ranked rewards withheld by anti-farming checks. This match is still recorded.";
    } catch (error) {
      logError("settlement_failed",error,{matchId:s.matchId});
      this.game.state.persistence = "failed";
    } finally {
      this.saving = false;
      this.publish();
    }
  }
}
