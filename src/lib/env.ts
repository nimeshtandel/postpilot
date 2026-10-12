import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Read a setting. On Cloudflare, vars and secrets arrive on the Worker env (OpenNext also copies them
 * to process.env); in `next dev` they come from .dev.vars via the Cloudflare context only.
 */
export function readVar(name: string): string | undefined {
  const fromProcess = process.env[name];
  if (fromProcess) return fromProcess;
  try {
    const value = (getCloudflareContext().env as unknown as Record<string, unknown>)[name];
    return typeof value === "string" && value ? value : undefined;
  } catch {
    return undefined; // outside a request
  }
}

/** Read a required setting, failing loudly with a helpful message. */
export function env(name: string): string {
  const v = readVar(name);
  if (!v) throw new Error(`Missing setting ${name}. See .dev.vars.example and the README.`);
  return v;
}

export function envOr(name: string, fallback: string): string {
  return readVar(name) || fallback;
}

export function appUrl(): string {
  return envOr("APP_URL", "http://localhost:3000").replace(/\/$/, "");
}

export function redirectUri(platform: string): string {
  return `${appUrl()}/api/connect/${platform}/callback`;
}
