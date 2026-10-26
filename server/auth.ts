import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config";
const secret =
  process.env.SESSION_SECRET ||
  (config.production
    ? ""
    : randomBytes(48).toString("hex"));
if (!secret)
  throw new Error("SESSION_SECRET must be configured in production.");
export const internalSecret = randomBytes(32).toString("hex");
export const fingerprint = (value: string) =>
  createHmac("sha256", secret).update(value).digest("hex");
export function issueTicket(id: string) {
  const data = Buffer.from(
    JSON.stringify({ id, exp: Date.now() + 60000 }),
  ).toString("base64url");
  return `${data}.${fingerprint(data)}`;
}
export function verifyTicket(ticket: unknown): string {
  if (typeof ticket !== "string" || ticket.length > 1024)
    throw new Error("A valid guest session is required.");
  const [data, sig] = ticket.split(".");
  const expected = fingerprint(data ?? "");
  if (
    ticket.split(".").length !== 2 || !sig ||
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    throw new Error("Invalid session ticket.");
  const payload = JSON.parse(Buffer.from(data, "base64url").toString());
  if (typeof payload.id !== "string" || !/^[a-f0-9-]{36}$/i.test(payload.id) || !Number.isSafeInteger(payload.exp) || payload.exp <= Date.now() || payload.exp > Date.now()+60000)
    throw new Error("Session ticket expired. Try joining again.");
  return payload.id;
}
