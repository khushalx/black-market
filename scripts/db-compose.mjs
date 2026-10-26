import { spawnSync } from "node:child_process";

export function startComposeDatabase() {
  const version = spawnSync("docker", ["version"], { encoding: "utf8" });
  if (version.error?.code === "ENOENT") {
    throw new Error(
      "Docker is not installed or is missing from PATH. Install Docker Desktop for your Mac, open it and finish setup, then retry npm run dev. See docs/LOCAL-DOCKER.md. No database was started or replaced.",
    );
  }
  if (version.status !== 0) {
    throw new Error(
      "Docker Engine is unavailable. Open Docker Desktop and wait until the engine is running, then retry npm run dev.",
    );
  }
  const compose = spawnSync("docker", ["compose", "version"], {
    stdio: "inherit",
  });
  if (compose.status !== 0)
    throw new Error("Docker Compose v2 is required; install it with Docker Desktop.");
  const start = spawnSync(
    "docker",
    ["compose", "up", "-d", "--wait", "--wait-timeout", "90", "postgres"],
    { stdio: "inherit" },
  );
  if (start.status !== 0)
    throw new Error(
      "PostgreSQL could not start through Docker Compose. Check the logs above. If port 54329 is occupied by the previous embedded database, preserve its data and stop that runtime first; see docs/LOCAL-DOCKER.md.",
    );
}

if (process.argv[1]?.endsWith("/db-compose.mjs")) {
  try {
    startComposeDatabase();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
