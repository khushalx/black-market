export function loadConfig(env: Record<string,string | undefined> = process.env) {
  const parseUrl=(value:string,label:string)=>{
    try {return new URL(value);} catch {throw Error(`Invalid ${label}.`);}
  };
  const production = env.NODE_ENV === "production";
  const port = Number(env.PORT ?? 2567);
  const trustProxy = Number(env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error("PORT must be an integer from 1 to 65535.");
  if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 5) throw Error("TRUST_PROXY_HOPS must be an integer from 0 to 5.");
  if (production && (!env.DATABASE_URL || !env.APP_ORIGIN || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || /replace-with|example|changeme/i.test(env.SESSION_SECRET)))
    throw Error("Production requires DATABASE_URL, APP_ORIGIN and a random SESSION_SECRET of at least 32 characters.");
  const origins = (env.APP_ORIGIN ?? "http://localhost:3000,http://127.0.0.1:3000").split(",").map(v=>v.trim());
  for (const origin of origins) {
    const url = parseUrl(origin,"APP_ORIGIN");
    if (url.origin !== origin || url.username || url.password || !["http:","https:"].includes(url.protocol) || (production && url.protocol !== "https:")) throw Error("APP_ORIGIN must contain exact HTTP origins (HTTPS in production), without trailing slashes.");
  }
  const databaseUrl = env.DATABASE_URL ?? "postgres://blackmarket:blackmarket@127.0.0.1:54329/blackmarket";
  if (!["postgres:","postgresql:"].includes(parseUrl(databaseUrl,"DATABASE_URL").protocol)) throw Error("DATABASE_URL must be a PostgreSQL URL.");
  const timings = ["RANKED_PREVIEW_SECONDS","RANKED_AUCTION_SECONDS","RANKED_RESULT_SECONDS"].map((key,index)=>Number(env[key] ?? [10,30,3][index]));
  if (timings.some((v,i)=>!Number.isInteger(v)||v<[3,5,2][i]||v>[30,90,15][i])) throw Error("Invalid ranked timing configuration.");
  return { production, port, trustProxy, origins, databaseUrl, timings, reconnectSeconds: 60 };
}
export const config = loadConfig();
export const originAllowed = (origin: string | undefined) => !origin || config.origins.includes(origin);
