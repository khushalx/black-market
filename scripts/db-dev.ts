import { access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";

const port = Number(process.env.LOCAL_DB_PORT ?? 54329);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw new Error("LOCAL_DB_PORT must be between 1024 and 65535.");
const databaseDir = resolve(
  process.cwd(),
  process.env.LOCAL_DB_DIRECTORY ?? ".local/postgres",
);
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: "blackmarket",
  password: "blackmarket",
  port,
  persistent: true,
  createPostgresUser: false,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: (message) => {
    if (/ready to accept connections/.test(String(message)))
      console.log("PostgreSQL is accepting connections.");
  },
});
let stopping = false;
async function databaseReady() {
  const client = new Client({
    host: "127.0.0.1",
    port,
    user: "blackmarket",
    password: "blackmarket",
    database: "postgres",
    connectionTimeoutMillis: 500,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}
async function waitForDatabase() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await databaseReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(
    `PostgreSQL did not become ready on port ${port} within 30 seconds.`,
  );
}
async function stop() {
  if (stopping) return;
  stopping = true;
  await postgres.stop();
  process.exit(0);
}
async function main() {
  if (await databaseReady()) {
    console.log(
      `Using the PostgreSQL instance already accepting connections on 127.0.0.1:${port}.`,
    );
    return;
  }
  await mkdir(databaseDir, { recursive: true });
  const initialized = await access(resolve(databaseDir, "PG_VERSION")).then(
    () => true,
    () => false,
  );
  if (!initialized) await postgres.initialise();
  // The package's startup promise depends on matching an English stderr line.
  // Verify readiness through a real authenticated query as well, so redirected
  // logging or a split log chunk cannot leave first-run setup hanging.
  await Promise.race([postgres.start(), waitForDatabase()]);
  const client = postgres.getPgClient("postgres", "127.0.0.1");
  await client.connect();
  try {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      ["blackmarket"],
    );
    if (!existing.rowCount) await client.query('CREATE DATABASE "blackmarket"');
  } finally {
    await client.end();
  }
  console.log(
    `BLACK MARKET database: postgres://blackmarket:***@127.0.0.1:${port}/blackmarket`,
  );
  console.log(
    `Persistent data: ${databaseDir}. Ctrl+C stops PostgreSQL without removing data.`,
  );
  process.on("SIGINT", () => {
    void stop();
  });
  process.on("SIGTERM", () => {
    void stop();
  });
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
