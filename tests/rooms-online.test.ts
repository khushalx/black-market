import test, { after } from "node:test";
import assert from "node:assert/strict";
import { Client, type Room } from "@colyseus/sdk";
import { closePersistence, createGuest, getHistory } from "../server/persistence";
import type { MarketSnapshot, PrivateState } from "../src/shared/market";
const endpoint=process.env.TEST_SERVER ?? "http://127.0.0.1:2567";
const enabled=process.env.ONLINE_TEST==="1";
after(async()=>{if(enabled)await closePersistence();});
async function wait(check:()=>boolean,label:string,state?:()=>unknown,timeout=35000) {
  const until=Date.now()+timeout;
  while(!check()) {
    if(Date.now()>until) throw Error(`Timed out: ${label}. ${JSON.stringify(state?.())}`);
    await new Promise(r=>setTimeout(r,25));
  }
}
async function api(path:string,token?:string,body?:unknown,origin?:string) {
  return fetch(`${endpoint}/api/${path}`,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...(token?{Cookie:`bm_session=${token}`} : {}),...(origin?{Origin:origin}:{})},body:body===undefined?undefined:JSON.stringify(body)});
}
async function ticket(token:string) {const r=await api("ticket",token,{});assert.equal(r.status,200);return (await r.json()).ticket;}
function observe(room:Room) {
  const seat={room,s:null as MarketSnapshot|null,private:null as PrivateState|null,errors:[] as string[]};
  room.onMessage("snapshot",s=>seat.s=s);room.onMessage("private",s=>seat.private=s);room.onMessage("error",e=>seat.errors.push(e));room.send("sync");return seat;
}
const options={maxPlayers:2,lots:4,previewSeconds:3,auctionSeconds:6,resultSeconds:2,bots:false};

test("two HTTP guests join by invite code, exchange $200/$250 bids, reload, settle and retrieve identical receipts",{skip:!enabled,timeout:120000},async()=>{
  const guests: {token:string;id:string}[]=[];
  for(const name of ["Two Client A","Two Client B"]) {
    const response=await api("guest",undefined,{nickname:name});assert.equal(response.status,200);
    const token=response.headers.getSetCookie().find(c=>c.startsWith("bm_session="))?.split(";")[0].slice("bm_session=".length);
    assert.ok(token);const result=await response.json();guests.push({token,id:result.profile.id});
  }
  const seats:ReturnType<typeof observe>[]=[];
  try {
    assert.equal((await api("me",guests[0].token)).status,200);
    assert.equal((await api("ticket",guests[0].token,{},"https://evil.example")).status,403);
    assert.equal((await api("me","forged-session-token-that-is-long-enough")).status,401);
    const a=observe(await new Client(endpoint).create("auction",{ticket:await ticket(guests[0].token),settings:options}));seats.push(a);
    assert.match(a.room.roomId,/^[A-F0-9]{6}$/);
    const invite=new URL(`http://localhost:3000/?room=${a.room.roomId}`);
    const b=observe(await new Client(endpoint).joinById(invite.searchParams.get("room")!,{ticket:await ticket(guests[1].token)}));seats.push(b);
    const states=()=>seats.map(s=>({phase:s.s?.phase,round:s.s?.round,bid:s.s?.bid,errors:s.errors}));
    await wait(()=>seats.every(s=>s.s?.players.length===2),"both see room",states);
    b.room.send("command",{type:"start"});await wait(()=>b.errors.length>0,"host permission",states);assert.match(b.errors.pop()!,/host/);
    a.room.send("command",{type:"ready",ready:true});b.room.send("command",{type:"ready",ready:true});
    await wait(()=>seats.every(s=>s.s?.players.every(p=>p.ready)),"ready",states);
    a.room.send("command",{type:"start"});await wait(()=>a.s?.phase==="preview","preview",states);
    a.room.send("command",{type:"inspect"});await wait(()=>!!a.private?.inspection,"private inspection",states);assert.equal(b.private?.inspection,null);
    const timePromise=new Promise<{id:number;serverNow:number}>(resolve=>a.room.onMessage("time",resolve));a.room.send("time",{id:1});const time=await timePromise;assert.equal(time.id,1);assert.ok(Math.abs(time.serverNow-Date.now())<2000);
    await wait(()=>seats.every(s=>s.s?.phase==="auction"),"first auction",states);
    a.room.send("command",{type:"bid",amount:200,requestId:"two-a-200",round:1});await wait(()=>b.s?.bid?.amount===200,"B receives 200",states);
    b.room.send("command",{type:"bid",amount:250,requestId:"two-b-250",round:1});await wait(()=>a.s?.bid?.amount===250,"A receives 250",states);
    for(const amount of [0,-25,250.5,Infinity,5001]) a.room.send("command",{type:"bid",amount,requestId:`invalid-${amount}`,round:1});
    await wait(()=>a.errors.length===5,"invalid bids rejected",states);assert.equal(a.s!.bid!.amount,250);a.errors.length=0;
    await wait(()=>seats.every(s=>s.s?.phase==="sold"),"sale",states);
    for(const seat of seats) {assert.equal(seat.s!.players.find(p=>p.id===guests[0].id)!.cash,5000);assert.equal(seat.s!.players.find(p=>p.id===guests[1].id)!.cash,4750);}
    await wait(()=>a.s?.round===2 && a.s.phase==="preview","next item",states);
    // Emulate page reload: discard the old SDK room and restore only its reserved token.
    b.room.reconnection.enabled=false;const token=b.room.reconnectionToken;b.room.connection.close(4010,"reload test");
    await wait(()=>a.s?.players.find(p=>p.id===guests[1].id)?.connected===false,"dropped",states);
    const resumed=observe(await new Client(endpoint).reconnect(token));seats[1]=resumed;
    await wait(()=>seats.every(s=>s.s?.players.every(p=>p.connected)),"reserved reload",states);
    assert.equal(resumed.s!.players.filter(p=>p.id===guests[1].id).length,1);assert.equal(resumed.s!.players.find(p=>p.id===guests[1].id)!.cash,4750);
    await wait(()=>seats.every(s=>s.s?.phase==="finished"&&s.s.persistence==="saved"),"complete",states,80000);
    assert.deepEqual(seats[0].s!.standings,seats[1].s!.standings);
    const history=await (await api("history",guests[1].token)).json();assert.equal(history[0].id,a.s!.matchId);assert.deepEqual(history[0].standings,a.s!.standings);
  } finally {await Promise.all(seats.map(s=>s.room.connection.isOpen?s.room.leave():Promise.resolve()));}
});

test("all departed players stay committed until an unattended match settles durably",{skip:!enabled,timeout:90000},async()=>{
  const guests=await Promise.all([0,1].map(i=>createGuest(`Abandoned QA ${i}`,`abandon-${crypto.randomUUID()}`)));
  const a=observe(await new Client(endpoint).create("auction",{ticket:await ticket(guests[0].sessionToken),settings:options}));
  const b=observe(await new Client(endpoint).joinById(a.room.roomId,{ticket:await ticket(guests[1].sessionToken)}));
  try {
    await wait(()=>b.s?.players.length===2,"abandoned room joins");
    for(const seat of [a,b]) seat.room.send("command",{type:"ready",ready:true});
    await wait(()=>a.s?.players.every(p=>p.ready)??false,"abandoned ready");a.room.send("command",{type:"start"});
    await wait(()=>a.s?.phase==="auction","abandoned bidding");a.room.send("command",{type:"bid",amount:200,requestId:"binding-200",round:1});
    await wait(()=>b.s?.bid?.amount===200,"accepted obligation");const matchId=a.s!.matchId;
    await a.room.leave();await b.room.leave();
    await assert.rejects(async()=>new Client(endpoint).create("auction",{ticket:await ticket(guests[0].sessionToken),settings:options}),/active|reserved/);
    let history=await getHistory(guests[0].profile.id);
    const until=Date.now()+70000;
    while(!history.some(h=>h.id===matchId)) {if(Date.now()>until)throw Error("Unattended match was not persisted");await new Promise(r=>setTimeout(r,250));history=await getHistory(guests[0].profile.id);}
    const own=history[0].standings.find(s=>s.id===guests[0].profile.id)!;assert.equal(own.cash,4800);assert.equal(own.purchases[0].paid,200);
    const next=await new Client(endpoint).create("auction",{ticket:await ticket(guests[0].sessionToken),settings:options});next.onMessage("snapshot",()=>{});next.onMessage("private",()=>{});await next.leave();
  } finally {await Promise.all([a,b].map(s=>s.room.connection.isOpen?s.room.leave():Promise.resolve()));}
});
