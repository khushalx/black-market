import nextEnv from "@next/env";

// Match Next.js precedence for the backend, migrations and development launcher.
// Explicit process variables continue to override files, including on Neon later.
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
