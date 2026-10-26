import { defineServer, defineRoom, matchMaker } from "@colyseus/core";
import { MarketWebSocketTransport } from "./transport";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { AuctionRoom, activePlayers } from "./room";
import { fingerprint, internalSecret, issueTicket } from "./auth";
import {
  createGuest,
  getHistory,
  getIdentityRisk,
  initPersistence,
  recoverBankroll,
  recoverGuest,
  renameProfile,
  resolveSession,
  revokeSession,
  closePersistence,
  persistenceHealthy,
} from "./persistence";
import { selectGroup, type QueueEntry } from "./matchmaking";
import { tierForBankroll } from "./progression";
import type { Profile } from "../src/shared/market";
import { config, originAllowed } from "./config";
import { PublicError, RateLimiter, logError } from "./security";
import { rankedReservations, releaseRankedReservation } from "./seats";

const queue = new Map<string, QueueEntry>();
let matching = false;
const queueBlocks = new Map<string, number>();
const limits = new RateLimiter();
const origins = config.origins;
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 30 * 86400000,
};
const nickname = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(
    /^[\p{L}\p{N} ._'\-]+$/u,
    "Use letters, numbers, spaces or simple punctuation.",
  );
async function identity(req: Request): Promise<Profile> {
  const p = await resolveSession(req.cookies?.bm_session ?? "");
  if (!p)
    throw Object.assign(
      new Error("Choose a nickname to create a guest account."),
      { status: 401 },
    );
  return p;
}
function device(req: Request, res: Response) {
  let id = req.cookies.bm_device;
  if (typeof id !== "string" || id.length !== 48) {
    id = randomBytes(24).toString("hex");
    res.cookie("bm_device", id, cookieOptions);
  }
  return { device: fingerprint(id), network: fingerprint(req.ip ?? "unknown") };
}
function rateLimit(key: string, max: number, window = 3600000) {
  limits.take(key,max,window);
}
const endpoint =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res).catch(next);
  };
const server = defineServer({
  transport: new MarketWebSocketTransport({
    maxPayload: 8192,
    // Give connections through public proxies time to recover from brief stalls.
    pingInterval: 10000,
    pingMaxRetries: 6,
    beforeUpgrade: (_request,context) => originAllowed(context.headers.get("origin") ?? undefined) ? undefined : new globalThis.Response("Unrecognized request origin.",{status:403}),
  }),
  rooms: { auction: defineRoom(AuctionRoom) },
  beforeListen: async () => {
    await initPersistence();
  },
  express: (app) => {
    app.disable("x-powered-by");
    app.set("trust proxy",config.trustProxy);
    app.use((req,res,next)=>{
      if(!originAllowed(req.headers.origin)) {res.status(403).json({error:"Unrecognized request origin."});return;}
      try {
        if(req.path.startsWith("/matchmake/")) {
          rateLimit(`matchmake:${req.ip}`,120,60000);
          if(/\/(joinById|reconnect)\//.test(req.path) && !/^[A-F0-9]{6}$/.test(req.path.split("/").at(-1) ?? "")) throw new PublicError("Invalid room code.");
        }
        if(req.path.startsWith("/api/")) rateLimit(`api:${req.ip}`,600,60000);
        next();
      } catch(error) {res.status(error instanceof PublicError?error.status:400).json({error:error instanceof PublicError?error.message:"Request rejected."});}
    });
    app.use(cors({ origin: origins, credentials: true }));
    app.use(express.json({ limit: "8kb" }));
    app.use(cookieParser());
    app.use("/api", (req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      if (
        req.method !== "GET" &&
        req.headers.origin &&
        !origins.includes(req.headers.origin)
      ) {
        res.status(403).json({ error: "Unrecognized request origin." });
        return;
      }
      next();
    });
    app.get("/health", endpoint(async (_req, res) => {
      const ok=await persistenceHealthy();
      res.status(ok?200:503).json({ok,service:"black-market-colyseus",database:ok?"ready":"unavailable"});
    }));
    app.get(
      "/api/me",
      endpoint(async (req, res) => res.json(await identity(req))),
    );
    app.post(
      "/api/guest",
      endpoint(async (req, res) => {
        const name = nickname.parse(req.body?.nickname);
        const current = await resolveSession(req.cookies?.bm_session ?? "");
        if (current) {
          res.json({ profile: current, recoveryCode: null });
          return;
        }
        rateLimit(`guest:${req.ip}`, 8);
        const keys = device(req, res);
        const result = await createGuest(name, keys.device, keys.network);
        res.cookie("bm_session", result.sessionToken, cookieOptions);
        res.json({
          profile: result.profile,
          recoveryCode: result.recoveryCode,
        });
      }),
    );
    app.post(
      "/api/recover",
      endpoint(async (req, res) => {
        rateLimit(`recover:${req.ip}`, 12, 900000);
        const code = z.string().min(16).max(200).parse(req.body?.recoveryCode);
        const keys = device(req, res);
        const result = await recoverGuest(code, keys.device, keys.network);
        res.cookie("bm_session", result.sessionToken, cookieOptions);
        res.json({
          profile: result.profile,
          recoveryCode: result.recoveryCode,
        });
      }),
    );
    app.post(
      "/api/logout",
      endpoint(async (req, res) => {
        await revokeSession(req.cookies?.bm_session ?? "");
        res.clearCookie("bm_session", cookieOptions);
        res.json({ ok: true });
      }),
    );
    app.post(
      "/api/profile",
      endpoint(async (req, res) => {
        const p = await identity(req);
        if (activePlayers.has(p.id))
          throw new Error("Change your nickname between rooms.");
        res.json(await renameProfile(p.id, nickname.parse(req.body?.nickname)));
      }),
    );
    app.post(
      "/api/ticket",
      endpoint(async (req, res) => {
        const p = await identity(req);
        rateLimit(`ticket:${p.id}`, 30, 60000);
        res.json({ ticket: issueTicket(p.id), profile: p });
      }),
    );
    app.get(
      "/api/history",
      endpoint(async (req, res) =>
        res.json(await getHistory((await identity(req)).id)),
      ),
    );
    app.get(
      "/api/rooms",
      endpoint(async (req, res) => {
        await identity(req);
        const rooms = await matchMaker.query({
          name: "auction",
          locked: false,
          private: false,
        });
        res.json(
          rooms.map((room) => ({
            roomId: room.roomId,
            players: room.clients,
            maxPlayers: room.maxClients,
            budget: room.metadata?.budget,
          })),
        );
      }),
    );
    app.post(
      "/api/bankroll/recover",
      endpoint(async (req, res) =>
        res.json(await recoverBankroll((await identity(req)).id)),
      ),
    );
    const enqueue = endpoint(async (req, res) => {
      const p = await identity(req);
      rateLimit(`queue:${p.id}`,90,60000);
      if (activePlayers.has(p.id))
        throw new Error("Leave your current room before joining matchmaking.");
      if ((queueBlocks.get(p.id) ?? 0) > Date.now())
        throw new Error(
          "These accounts cannot receive another ranked match together right now. Try a friends room or wait for different opponents.",
        );
      const entry = queue.get(p.id) ?? { profile: p, joinedAt: Date.now() };
      entry.profile = p;
      entry.lastSeenAt = Date.now();
      queue.set(p.id, entry);
      res.json({
        status: entry.roomId ? "matched" : "waiting",
        roomId: entry.roomId,
        tier: tierForBankroll(p.bankroll),
        waitSeconds: Math.floor((Date.now() - entry.joinedAt) / 1000),
        ratingWindow: Math.min(
          600,
          150 + Math.floor((Date.now() - entry.joinedAt) / 15000) * 100,
        ),
      });
    });
    app.post("/api/queue", enqueue);
    app.get("/api/queue", enqueue);
    app.post(
      "/api/queue/cancel",
      endpoint(async (req, res) => {
        const id=(await identity(req)).id;
        queue.delete(id);
        if(!activePlayers.has(id)) releaseRankedReservation(id);
        res.json({ ok: true });
      }),
    );
    app.use(
      (error: unknown, _req: Request, res: Response, next: NextFunction) => {
        void next;
        const err = error as Error & { status?: number };
        const validation=error instanceof z.ZodError;
        const known=error instanceof PublicError || (err.status && err.status>=400 && err.status<500) || (error instanceof Error && /^(Choose|Recovery|Recover|Change|Leave|These accounts|Your|Profile|Use letters)/.test(error.message));
        if(!validation&&!known) logError("http_request_failed",error);
        res
          .status(validation?400:known?(err.status??400):500)
          .json({
            error:
              validation
                ? error.issues[0]?.message
                : known ? err.message : "The online service could not complete the request. Please try again.",
          });
      },
    );
  },
});
const timer = setInterval(async () => {
  if (matching) return;
  matching = true;
  try {
    const now = Date.now();
    for (const [id, e] of queue)
      if (now - (e.lastSeenAt ?? e.joinedAt) > 15000 || activePlayers.has(id) || (e.roomId && !matchMaker.getLocalRoomById(e.roomId))) {
        queue.delete(id);
        if(!activePlayers.has(id)) releaseRankedReservation(id,e.roomId);
      }
    for (const [id, until] of queueBlocks)
      if (until < now) queueBlocks.delete(id);
    const group = selectGroup([...queue.values()], now);
    if (group.length) {
      if (await getIdentityRisk(group.map((e) => e.profile.id))) {
        for (const e of group.slice(1)) {
          queue.delete(e.profile.id);
          queueBlocks.set(e.profile.id, now + 30000);
        }
      } else {
        if(group.some(e=>queue.get(e.profile.id)!==e || activePlayers.has(e.profile.id) || rankedReservations.has(e.profile.id))) return;
        for(const e of group) rankedReservations.set(e.profile.id,"pending");
        try {
          const room = await matchMaker.createRoom("auction", {
            internal: internalSecret,
            ranked: true,
            allowed: group.map((e) => e.profile.id),
          });
          for (const e of group) {
            if(queue.get(e.profile.id)===e && rankedReservations.get(e.profile.id)==="pending") {
              e.roomId=room.roomId;rankedReservations.set(e.profile.id,room.roomId);
            }
          }
        } catch(error) {
          for(const e of group) releaseRankedReservation(e.profile.id,"pending");
          throw error;
        }
      }
    }
  } catch (error) {
    logError("matchmaking_failed",error);
  } finally {
    matching = false;
  }
}, 1000);
timer.unref();
server.onBeforeShutdown(()=>{clearInterval(timer);queue.clear();});
server.onShutdown(()=>closePersistence());
await server.listen(config.port, "0.0.0.0");
console.log(
  `BLACK MARKET Colyseus listening on http://localhost:${process.env.PORT ?? 2567}`,
);
