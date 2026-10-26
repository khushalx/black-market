import test from "node:test";
import assert from "node:assert/strict";
import { Server, Room } from "@colyseus/core";
import WebSocket from "ws";
import { MarketWebSocketTransport } from "../server/transport";
import { createMarketRoutes } from "../server/routes";

test("incoming application messages keep a client alive without control pongs; idle clients still expire", {timeout:10000}, async () => {
  class HeartbeatRoom extends Room {
    onCreate() { this.onMessage("pulse", () => {}); }
  }
  const transport = new MarketWebSocketTransport({pingInterval:100,pingMaxRetries:3});
  const server = new Server({transport,greet:false,gracefullyShutdown:false});
  server.router = createMarketRoutes();
  server.define("heartbeat", HeartbeatRoom);
  await server.listen(0,"127.0.0.1");
  const address = transport.server!.address();
  assert.ok(address && typeof address !== "string");
  let socket: WebSocket | undefined;
  let pulse: ReturnType<typeof setInterval> | undefined;
  try {
    const rejected = await fetch(`http://127.0.0.1:${address.port}/matchmake/create/missing`, {method:"POST",headers:{"content-type":"application/json"},body:"{}"});
    assert.equal(rejected.status,400,"matchmaking errors must not become proxy gateway errors");
    assert.equal((await rejected.json()).code,520);
    const response = await fetch(`http://127.0.0.1:${address.port}/matchmake/create/heartbeat`, {method:"POST",headers:{"content-type":"application/json"},body:"{}"});
    const reservation = await response.json();
    assert.equal(response.status,200);
    socket = new WebSocket(`ws://127.0.0.1:${address.port}/${reservation.processId}/${reservation.roomId}?sessionId=${reservation.sessionId}`, {autoPong:false});
    const ws = socket;
    let controlPings = 0;
    ws.on("ping", () => { controlPings++; });
    // Acknowledge Colyseus' join handshake, then send ordinary room-data frames.
    ws.on("message", data => { if(new Uint8Array(data as ArrayBuffer)[0] === 10) ws.send(new Uint8Array([10])); });
    await new Promise<void>((resolve,reject) => {ws.once("open",resolve);ws.once("error",reject);});
    const frame = new Uint8Array([13,165,112,117,108,115,101]); // ROOM_DATA, "pulse"
    pulse = setInterval(() => {if(ws.readyState === WebSocket.OPEN) ws.send(frame);},50);
    await new Promise(resolve => setTimeout(resolve,1100));
    assert.equal(ws.readyState,WebSocket.OPEN,"regular messages must prevent a false heartbeat timeout");
    assert.equal(controlPings,0,"application liveness must not depend on proxy control frames");
    clearInterval(pulse);
    await Promise.race([new Promise(resolve => ws.once("close",resolve)),new Promise((_,reject)=>setTimeout(()=>reject(Error("idle socket was not terminated")),1200))]);
    assert.equal(ws.readyState,WebSocket.CLOSED);
  } finally {
    clearInterval(pulse);socket?.terminate();await server.gracefullyShutdown(false);
  }
});
