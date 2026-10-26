import { Client, type Room } from "@colyseus/sdk";
import { Auction } from "../domain/auction";
import { ServerClock } from "./server-clock";
import type {
  MarketAdapter,
  MarketCommand,
  MarketSnapshot,
  PrivateState,
  Profile,
  RoomSettings,
} from "../shared/market";

export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
    });
  } catch {
    throw new Error(
      "The online service is unavailable. Offline practice is still available.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.error ??
        "The online service is unavailable. Start the Colyseus server and database, or use practice.",
    );
  return data as T;
}
const serverUrl = () =>
  process.env.NEXT_PUBLIC_WS_URL ??
  `${location.protocol}//${location.hostname}:2567`;
const cacheKey = "bm_reserved_room";
class OnlineAdapter implements MarketAdapter {
  private snapshot: MarketSnapshot | null = null;
  private privateData: PrivateState = { inspection: null, offer: null };
  private listeners = new Set<() => void>();
  status = "connected";
  error: string | null = null;
  private departing = false;
  private clock=new ServerClock();
  private clockTimer: ReturnType<typeof setInterval>;
  private probeId=0;
  private lastProbeAt=-Infinity;
  private probes=new Map<number,number>();
  constructor(
    private room: Room,
    readonly playerId: string,
    private endpoint: string,
  ) {
    room.reconnection.minUptime = 0;
    room.reconnection.maxRetries = 30;
    room.reconnection.maxDelay = 5000;
    room.onMessage("snapshot", (snapshot: MarketSnapshot) => {
      this.snapshot = snapshot;
      const received=performance.now();
      this.clock.observe(snapshot.serverNow,received);
      // Background tabs throttle timers. Server updates keep clock probes and
      // connection liveness running without relying on render timer ticks.
      if(received-this.lastProbeAt>=10000) this.probe();
      this.emit();
    });
    room.onMessage("private", (value: PrivateState) => {
      this.privateData = value;
      this.emit();
    });
    room.onMessage("error", (error: string) => {
      this.error = error;
      this.emit();
    });
    room.onMessage("time",(reply:{id:number;serverNow:number})=>{
      const sent=this.probes.get(reply.id);
      if(sent!==undefined) {this.clock.sample(sent,performance.now(),reply.serverNow);this.probes.delete(reply.id);}
    });
    room.onDrop(() => {
      this.status = "reconnecting";
      this.emit();
    });
    room.onReconnect(() => {
      this.status = "connected";
      this.error = null;
      this.remember();
      this.room.send("sync");
      this.probe();
      this.emit();
    });
    room.onLeave(() => {
      clearInterval(this.clockTimer);
      this.status = "disconnected";
      if (!this.departing)
        this.error =
          "Connection ended. Accepted bids remain binding. Return home when the match ends.";
      this.emit();
    });
    room.onError((_code, message) => {
      this.error = message ?? "Connection error.";
      this.emit();
    });
    this.remember();
    room.send("sync");
    this.probe();
    this.clockTimer=setInterval(()=>this.emit(),250);
  }
  private probe() {
    this.probes.clear();
    const id=++this.probeId;this.lastProbeAt=performance.now();this.probes.set(id,this.lastProbeAt);this.room.send("time",{id});
  }
  getServerNow = () => this.clock.now(performance.now());
  private remember() {
    try {
    sessionStorage.setItem(
      cacheKey,
      JSON.stringify({
        token: this.room.reconnectionToken,
        playerId: this.playerId,
        endpoint: this.endpoint,
      }),
    );
    } catch { /* Storage restrictions must not break an established live connection. */ }
  }
  private emit() {
    this.listeners.forEach((fn) => fn());
  }
  getSnapshot = () => this.snapshot;
  getPrivate = () => this.privateData;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  send(command: MarketCommand) {
    if (this.status !== "connected") {
      this.error = "Reconnect before taking an action.";
      this.emit();
      return;
    }
    this.error = null;
    this.room.send("command", command);
    this.emit();
  }
  leave() {
    this.departing = true;
    this.room.reconnection.enabled = false;
    clearInterval(this.clockTimer);
    try {sessionStorage.removeItem(cacheKey);} catch {}
    void this.room.leave();
    this.listeners.clear();
  }
}
export async function connectRoom(
  action: "create" | "join",
  options: Record<string, unknown>,
): Promise<MarketAdapter> {
  const { ticket, profile } = await api<{ ticket: string; profile: Profile }>(
    "ticket",
    {},
  );
  const endpoint = serverUrl();
  const client = new Client(endpoint);
  const room =
    action === "create"
      ? await client.create("auction", { ticket, settings: options.settings })
      : await client.joinById(String(options.roomId).trim().toUpperCase(), {
          ticket,
        });
  return new OnlineAdapter(room, profile.id, endpoint);
}
export async function resumeRoom(): Promise<MarketAdapter | null> {
  try {
    const saved = sessionStorage.getItem(cacheKey);
    if (!saved) return null;
    const { token, playerId, endpoint } = JSON.parse(saved);
    if(endpoint!==serverUrl() || typeof token!=="string" || token.length>500) throw Error("Invalid reserved session.");
    const profile = await api<Profile>("me");
    if (profile.id !== playerId) throw new Error("Identity changed.");
    const room = await new Client(endpoint).reconnect(token);
    return new OnlineAdapter(room, playerId, endpoint);
  } catch {
    try {sessionStorage.removeItem(cacheKey);} catch {}
    return null;
  }
}
export const joinQueue = () =>
  api<{
    status: string;
    roomId?: string;
    tier?: string;
    waitSeconds?: number;
    ratingWindow?: number;
  }>("queue", {});
export const cancelQueue = async () => {
  await api("queue/cancel", {});
};
class PracticeAdapter implements MarketAdapter {
  private game: Auction;
  private snapshot: MarketSnapshot;
  private privateData: PrivateState;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval>;
  readonly playerId = "practice-you";
  status = "connected";
  error: string | null = null;
  constructor(nickname: string, settings: Partial<RoomSettings>) {
    this.game = new Auction(
      "PRACTICE",
      this.playerId,
      { ...settings, bots: true },
      "practice",
    );
    this.game.addPlayer(this.playerId, nickname || "You");
    for (let i = 1; i < this.game.state.settings.maxPlayers; i++)
      this.game.addPlayer(
        `bot-${i}`,
        ["Alex", "Morgan", "Jamie", "Robin", "Sam", "Drew"][i - 1],
        true,
      );
    this.snapshot = this.game.snapshot();
    this.privateData = this.game.privateState(this.playerId);
    this.timer = setInterval(() => {
      this.game.tick();
      this.publish();
    }, 250);
  }
  private publish() {
    this.snapshot = this.game.snapshot();
    this.privateData = this.game.privateState(this.playerId);
    this.listeners.forEach((fn) => fn());
  }
  getSnapshot = () => this.snapshot;
  getPrivate = () => this.privateData;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  send(command: MarketCommand) {
    try {
      this.error = null;
      this.game.command(this.playerId, command);
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Action rejected.";
    }
    this.publish();
  }
  leave() {
    clearInterval(this.timer);
    this.listeners.clear();
    this.status = "disconnected";
  }
}
export function startPractice(
  nickname: string,
  settings: Partial<RoomSettings> = {},
): MarketAdapter {
  return new PracticeAdapter(nickname, settings);
}
