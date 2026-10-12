// X (Twitter) API v2 with OAuth 2.0 Authorization Code + PKCE.
import { env, redirectUri } from "../env";
import { readMedia } from "../media";
import { form, qs, request } from "./http";
import type { ConnectAdapter, MediaItem, PublishAdapter, PublishInput } from "./types";

const API = "https://api.x.com/2";
const basic = () => "Basic " + btoa(`${env("X_CLIENT_ID")}:${env("X_CLIENT_SECRET")}`);

async function token(params: Record<string, string>) {
  const { data } = await request("X", `${API}/oauth2/token`, {
    method: "POST",
    headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded" },
    body: form({ client_id: env("X_CLIENT_ID"), ...params }),
  });
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    tokenExpiresAt: new Date(Date.now() + (data.expires_in ?? 7200) * 1000),
  };
}

export const xConnect: ConnectAdapter = {
  pkce: true,
  requiredEnv: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
  authUrl(state, challenge) {
    return `https://x.com/i/oauth2/authorize?${qs({
      response_type: "code",
      client_id: env("X_CLIENT_ID"),
      redirect_uri: redirectUri("x"),
      scope: "tweet.read tweet.write users.read media.write offline.access",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    })}`;
  },
  async callback(code, verifier) {
    const t = await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri("x"), code_verifier: verifier! });
    const { data } = await request("X", `${API}/users/me?user.fields=profile_image_url`, {
      headers: { Authorization: `Bearer ${t.accessToken}` },
    });
    return [{
      platform: "x",
      externalId: data.data.id,
      name: data.data.name,
      username: data.data.username,
      avatarUrl: data.data.profile_image_url,
      ...t,
    }];
  },
};

const CATEGORY: Record<string, string> = { image: "tweet_image" };

/** Chunked media upload: initialize → append → finalize. Returns the media id. */
async function uploadMedia(item: MediaItem, accessToken: string): Promise<string> {
  const auth = { Authorization: `Bearer ${accessToken}` };
  const bytes = await readMedia(item);
  const { data: init } = await request("X", `${API}/media/upload/initialize`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ media_type: item.mimeType, total_bytes: bytes.length, media_category: CATEGORY[item.kind] }),
  });
  const id: string = init.data.id;

  const SEG = 4 * 1024 * 1024;
  for (let i = 0, seg = 0; i < bytes.length; i += SEG, seg++) {
    const fd = new FormData();
    fd.set("segment_index", String(seg));
    fd.set("media", new Blob([bytes.subarray(i, i + SEG)], { type: item.mimeType }));
    await request("X", `${API}/media/upload/${id}/append`, { method: "POST", headers: auth, body: fd });
  }
  await request("X", `${API}/media/upload/${id}/finalize`, { method: "POST", headers: auth });
  return id;
}

export const xPublisher: PublishAdapter = {
  refreshWindowMs: 5 * 60_000,
  async refresh({ refreshToken }) {
    if (!refreshToken) return null;
    return token({ grant_type: "refresh_token", refresh_token: refreshToken });
  },
  async publish({ account, text, media }: PublishInput) {
    const mediaIds: string[] = [];
    for (const m of media.filter((m) => m.kind === "image").slice(0, 4)) mediaIds.push(await uploadMedia(m, account.accessToken));
    const { data } = await request("X", `${API}/tweets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) }),
    });
    const handle = account.meta.username ?? "i";
    return { id: data.data.id, url: `https://x.com/${handle}/status/${data.data.id}` };
  },
};
