/** Error carrying the platform's own message so users see something actionable. */
export class PlatformError extends Error {
  constructor(
    public platform: string,
    message: string,
    public status?: number,
    /** true when the token is invalid/expired and the user must reconnect. */
    public authExpired = false,
  ) {
    super(`${platform}: ${message}`);
  }
}

function extractMessage(body: unknown): string {
  if (!body || typeof body !== "object") return String(body ?? "Unknown error");
  const b = body as Record<string, any>;
  return (
    b.error?.message ||
    b.error?.error_user_msg ||
    b.error_description ||
    b.message ||
    b.detail ||
    b.title ||
    (Array.isArray(b.errors) && b.errors[0]?.message) ||
    (typeof b.error === "string" ? b.error : null) ||
    JSON.stringify(body).slice(0, 300)
  );
}

/** fetch + JSON parse + uniform errors. */
export async function request<T = any>(platform: string, url: string, init: RequestInit = {}): Promise<{ data: T; res: Response }> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e: any) {
    throw new PlatformError(platform, `couldn't reach the ${platform} API (${e?.cause?.code ?? e?.message ?? "network error"})`);
  }
  const text = await res.text();
  let data: any = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON body */
  }
  // TikTok returns 200 with error.code != "ok"
  const tiktokError = data?.error?.code && data.error.code !== "ok";
  if (!res.ok || tiktokError) {
    const authExpired =
      res.status === 401 ||
      data?.error?.code === 190 || // Meta: invalid OAuth token
      data?.error?.code === "access_token_invalid";
    throw new PlatformError(platform, extractMessage(data), res.status, authExpired);
  }
  return { data: data as T, res };
}

export function form(params: Record<string, string | number | boolean | undefined>): URLSearchParams {
  const f = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) f.set(k, String(v));
  return f;
}

export function qs(params: Record<string, string | number | undefined>): string {
  return form(params).toString();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll `check` until it returns a non-undefined value or the timeout passes. */
export async function poll<T>(
  check: () => Promise<T | undefined>,
  { intervalMs = 5000, timeoutMs = 300_000, what = "processing" } = {},
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await check();
    if (v !== undefined) return v;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${what}`);
}
