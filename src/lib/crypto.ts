// Web Crypto only, so it runs on Cloudflare Workers (and Node) without native modules.
import { env, envOr } from "./env";

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const toB64Url = (bytes: Uint8Array) => toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function randomToken(bytes = 32): string {
  return toB64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function randomHex(bytes = 16): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** PKCE S256 challenge for a verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  return toB64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier))));
}

// ─── AES-256-GCM for social tokens at rest: base64(iv).base64(ciphertext+tag) ───

let keyPromise: Promise<CryptoKey> | null = null;
function aesKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    const raw = fromB64(env("ENCRYPTION_KEY"));
    if (raw.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32).");
    keyPromise = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  return keyPromise;
}

export async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), enc.encode(plain)));
  return `${toB64(iv)}.${toB64(ct)}`;
}

export async function decrypt(payload: string): Promise<string> {
  const [iv, ct] = payload.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await aesKey(), fromB64(ct));
  return dec.decode(pt);
}

// ─── Password hashing: PBKDF2-SHA256 ───
// Strength comes from PASSWORD_HASH_ITERATIONS (20,000 fits the Workers free plan's 10 ms CPU limit;
// 100,000 is the Workers maximum). Each hash stores its own count, so raising it later is safe.

export function hashIterations(): number {
  const n = Number(envOr("PASSWORD_HASH_ITERATIONS", "20000"));
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 10_000), 100_000) : 20_000;
}

/** True when a stored hash is weaker than the current setting (re-hash it at next login). */
export function needsRehash(stored: string): boolean {
  const iter = Number(stored.split("$")[1]);
  return !Number.isFinite(iter) || iter < hashIterations();
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = hashIterations();
  return `pbkdf2$${iterations}$${toB64(salt)}$${toB64(await pbkdf2(password, salt, iterations))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2") return false;
  const actual = await pbkdf2(password, fromB64(salt), Number(iter));
  const expected = fromB64(hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]; // constant time
  return diff === 0;
}
