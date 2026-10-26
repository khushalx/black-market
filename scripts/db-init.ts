import { closePersistence, initPersistence } from "../server/persistence";

async function main() {
  await initPersistence();
  console.log("BLACK MARKET PostgreSQL schema is ready.");
  await closePersistence();
}
main().catch(async (error: unknown) => {
  console.error(error);
  await closePersistence();
  process.exitCode = 1;
});
