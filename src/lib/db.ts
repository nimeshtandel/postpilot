import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export type DB = DrizzleD1Database<typeof schema>;

/** Drizzle bound to the D1 database of the current request (binding "DB" in wrangler.jsonc). */
export function getDb(): DB {
  return drizzle(getCloudflareContext().env.DB, { schema });
}

/** Convenience: `db.select()...` resolves the D1 binding lazily, per call. */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    const value = (real as any)[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export * from "./schema";
