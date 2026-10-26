import { spawn } from "node:child_process";
import { Client } from "pg";
import "./env.mjs";
import { startComposeDatabase } from "./db-compose.mjs";

const defaultDatabase =
  "postgres://blackmarket:blackmarket@127.0.0.1:54329/blackmarket";
const databaseUrl = process.env.DATABASE_URL ?? defaultDatabase;
const children = [];
let ending = false;
function run(args) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(error);
    void stop(1);
  });
  child.on("exit", (code) => {
    if (!ending && code) {
      console.error("Development process exited:", code);
      void stop(code);
    }
  });
  return child;
}
async function stop(code = 0) {
  if (ending) return;
  ending = true;
  await Promise.all(
    children
      .filter((child) => child.exitCode === null)
      .map(
        (child) =>
          new Promise((resolve) => {
            child.once("exit", resolve);
            child.kill("SIGTERM");
            const timer = setTimeout(() => {
              child.kill("SIGKILL");
              resolve();
            }, 5000);
            timer.unref();
          }),
      ),
  );
  process.exit(code);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
async function waitUntil(check, label, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline && !ending) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    label + " did not become ready. See the preceding service logs.",
  );
}
try {
  const target = new URL(databaseUrl);
  if (["localhost", "127.0.0.1"].includes(target.hostname) && target.port === "54329")
    startComposeDatabase();
  await waitUntil(
    async () => {
      const client = new Client({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 600,
      });
      try {
        await client.connect();
        await client.query("SELECT 1");
        return true;
      } catch {
        return false;
      } finally {
        await client.end().catch(() => {});
      }
    },
    "PostgreSQL",
    45000,
  );
  run(["--import", "./scripts/env.mjs", "--import", "tsx", "server/index.ts"]);
  await waitUntil(
    async () => {
      try {
        const response = await fetch(
          "http://127.0.0.1:" + (process.env.PORT ?? 2567) + "/health",
          { signal: AbortSignal.timeout(700) },
        );
        return response.ok;
      } catch {
        return false;
      }
    },
    "Colyseus",
    30000,
  );
  // PORT configures Colyseus in the shared environment, so pin the web port.
  run(["node_modules/next/dist/bin/next", "dev", "--hostname", "0.0.0.0", "--port", "3000"]);
} catch (error) {
  console.error(error.message);
  await stop(1);
}
