export class PublicError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
/** Fixed windows with bounded key storage, shared by HTTP and room entry points. */
export class RateLimiter {
  private entries = new Map<string,{at:number;count:number;window:number}>();
  take(key:string,max:number,window:number,now=Date.now()) {
    const previous = this.entries.get(key);
    if (previous && now - previous.at < previous.window) {
      if (++previous.count > max) throw new PublicError("Too many attempts. Please try again later.",429);
      return;
    }
    if (this.entries.size >= 10000) {
      for (const [id,value] of this.entries) if(now-value.at>=value.window) this.entries.delete(id);
      if(this.entries.size>=10000) throw new PublicError("Service is busy. Please try again shortly.",429);
    }
    this.entries.set(key,{at:now,count:1,window});
  }
}
export const roomLimits = new RateLimiter();
/** Never serialize request payloads, URLs, database messages or credential-bearing errors. */
export function logError(event:string,error:unknown,context:Record<string,string>={}) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
  console.error(JSON.stringify({level:"error",event,code,...context,time:new Date().toISOString()}));
}
