import { randomBytes } from "node:crypto";
export const activePlayers = new Map<string,string>();
export const rankedReservations = new Map<string,string>();
const roomCodes = new Set<string>();
export function reserveRoomCode(generate=()=>randomBytes(3).toString("hex").toUpperCase()) {
  for(let i=0;i<100;i++) {
    const code=generate();
    if(!/^[A-F0-9]{6}$/.test(code)) throw Error("Invalid generated room code.");
    if(!roomCodes.has(code)) {roomCodes.add(code);return code;}
  }
  throw Error("No room code available. Try again.");
}
export function releaseRoomCode(code:string) {roomCodes.delete(code);}
export function releaseRankedReservation(id:string,roomId?:string) {
  if(roomId===undefined||rankedReservations.get(id)===roomId) rankedReservations.delete(id);
}
