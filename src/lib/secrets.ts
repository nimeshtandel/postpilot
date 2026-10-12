// App-internal secrets (AUTH_SECRET, ENCRYPTION_KEY, CRON_SECRET).
// If one isn't set as a Worker secret, the app generates it once and keeps it in the D1 table
// `app_secrets`, so a fresh deploy works without anyone copying keys around.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { readVar } from "./env";

type SecretName = "AUTH_SECRET" | "ENCRYPTION_KEY" | "CRON_SECRET";

function generate(name: SecretName): string {
  const bytes = crypto.getRandomValues(new Uint8Array(name === "CRON_SECRET" ? 16 : 32));
  if (name === "CRON_SECRET") return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** Read (or create once) a secret from a D1 database. Shared with worker.ts. */
export async function secretFromD1(d1: D1Database, name: SecretName): Promise<string> {
  const row = await d1.prepare("SELECT value FROM app_secrets WHERE name = ?").bind(name).first<{ value: string }>();
  if (row?.value) return row.value;
  // INSERT OR IGNORE + re-read: if two requests race, both end up with the same stored value.
  await d1.prepare("INSERT OR IGNORE INTO app_secrets (name, value) VALUES (?, ?)").bind(name, generate(name)).run();
  const stored = await d1.prepare("SELECT value FROM app_secrets WHERE name = ?").bind(name).first<{ value: string }>();
  if (!stored?.value) throw new Error(`Couldn't create ${name}`);
  return stored.value;
}

const cache = new Map<SecretName, string>();

export async function getSecret(name: SecretName): Promise<string> {
  const fromEnv = readVar(name);
  if (fromEnv) return fromEnv;
  const hit = cache.get(name);
  if (hit) return hit;
  const value = await secretFromD1(getCloudflareContext().env.DB, name);
  cache.set(name, value);
  return value;
}
