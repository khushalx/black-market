import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { issueTicket, verifyTicket } from "../server/auth";
import { loadConfig, originAllowed } from "../server/config";
import { RateLimiter } from "../server/security";
import { reserveRoomCode, releaseRoomCode } from "../server/seats";
import { ServerClock } from "../src/client/server-clock";

test("signed room tickets reject tampering, suffixes and expired tickets",()=>{
  const id=randomUUID(),ticket=issueTicket(id);
  assert.equal(verifyTicket(ticket),id);
  assert.throws(()=>verifyTicket(ticket+".ignored"));
  assert.throws(()=>verifyTicket(ticket.replace(ticket[0],ticket[0]==="a"?"b":"a")));
  assert.throws(()=>verifyTicket(null));
  const now=Date.now;
  try {Date.now=()=>now()+61000;assert.throws(()=>verifyTicket(ticket),/expired/);}finally{Date.now=now;}
});
test("configuration rejects insecure or malformed deployment settings before listening",()=>{
  const production={NODE_ENV:"production",DATABASE_URL:"postgres://example:pass@db/game",SESSION_SECRET:"a".repeat(48),APP_ORIGIN:"https://game.example"};
  assert.equal(loadConfig(production).port,2567);
  assert.throws(()=>loadConfig({...production,SESSION_SECRET:"changeme"}));
  assert.throws(()=>loadConfig({...production,APP_ORIGIN:"http://game.example"}));
  assert.throws(()=>loadConfig({...production,APP_ORIGIN:"https://game.example/path"}));
  assert.throws(()=>loadConfig({PORT:"NaN"}));
  assert.throws(()=>loadConfig({TRUST_PROXY_HOPS:"true"}));
  assert.throws(()=>loadConfig({RANKED_AUCTION_SECONDS:"0"}));
  assert.throws(()=>loadConfig({DATABASE_URL:"secret-value-is-not-a-url"}),/^Error: Invalid DATABASE_URL\.$/);
  assert.equal(originAllowed("https://untrusted.example"),false);
  assert.equal(originAllowed(undefined),true,"native clients still require signed room tickets");
});
test("room codes retry collisions and release disposed allocations",()=>{
  const code=reserveRoomCode(()=>"A1B2C3");
  let attempts=0;
  const other=reserveRoomCode(()=>++attempts===1?code:"A1B2C4");
  assert.equal(other,"A1B2C4");
  assert.equal(attempts,2);
  assert.throws(()=>reserveRoomCode(()=>code));
  releaseRoomCode(code);releaseRoomCode(other);
  assert.equal(reserveRoomCode(()=>code),code);releaseRoomCode(code);
});
test("throttles isolate identities and enforce the entire window",()=>{
  const limit=new RateLimiter();
  limit.take("a",2,1000,100);limit.take("a",2,1000,101);
  assert.throws(()=>limit.take("a",2,1000,102),/Too many/);
  assert.doesNotThrow(()=>limit.take("b",2,1000,102));
  assert.doesNotThrow(()=>limit.take("a",2,1000,1100));
});
test("countdown clock compensates round-trip delay and ignores local wall-clock skew",()=>{
  const clock=new ServerClock();clock.observe(100000,10);
  assert.equal(clock.now(110),100100);
  clock.sample(100,140,200120);
  assert.equal(clock.now(200),200200);
  clock.sample(200,500,999999);
  assert.equal(clock.now(300),200300,"higher-latency sample cannot replace a fresher low-latency one");
  clock.sample(400,399,999999);clock.sample(400,Infinity,999999);
  assert.equal(clock.now(500),200500);
  clock.sample(40000,40020,240010);
  assert.equal(clock.now(40100),240100);
});
