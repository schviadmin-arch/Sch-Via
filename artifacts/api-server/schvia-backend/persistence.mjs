import { createPersistence as createJsonPersistence } from "./data-store.mjs";

const DEFAULT_MODE = "json";

export function createPersistence(options = {}) {
  const mode = (options.mode || process.env.PERSISTENCE_MODE || DEFAULT_MODE).toString().trim().toLowerCase();
  if (mode === "json") {
    return createJsonPersistence(options);
  }
  if (mode === "postgres") {
    throw new Error("Postgres persistence is not wired into this service yet. Use PERSISTENCE_MODE=json.");
  }
  throw new Error(`Unsupported PERSISTENCE_MODE: ${mode}. Set PERSISTENCE_MODE=json or PERSISTENCE_MODE=postgres.`);
}
