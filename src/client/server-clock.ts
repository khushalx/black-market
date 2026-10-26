/** Estimate the server clock at the midpoint of a round trip; use monotonic elapsed time. */
export class ServerClock {
  private offset: number | null = null;
  private bestRtt = Infinity;
  private sampledAt = -Infinity;
  private fallback = {server:0,received:0};
  observe(serverNow:number,received:number) {
    if(Number.isFinite(serverNow)) this.fallback={server:serverNow,received};
  }
  sample(sent:number,received:number,serverNow:number) {
    const rtt=received-sent;
    if(![sent,received,serverNow].every(Number.isFinite)||rtt<0||rtt>5000) return;
    if(rtt<=this.bestRtt || received-this.sampledAt>30000) {
      this.offset=serverNow-(sent+received)/2;this.bestRtt=rtt;this.sampledAt=received;
    }
  }
  now(monotonic:number) {
    return this.offset===null ? this.fallback.server+Math.max(0,monotonic-this.fallback.received) : monotonic+this.offset;
  }
}
