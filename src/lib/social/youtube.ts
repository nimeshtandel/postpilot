// YouTube Data API v3: resumable video upload. Vertical videos up to 3 minutes become Shorts.
import { env, redirectUri } from "../env";
import { mediaBody } from "../media";
import { form, qs, request } from "./http";
import type { ConnectAdapter, PublishAdapter, PublishInput } from "./types";

async function token(params: Record<string, string>) {
  const { data } = await request("YouTube", "https://oauth2.googleapis.com/token", {
    method: "POST",
    body: form({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), ...params }),
  });
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export const youtubeConnect: ConnectAdapter = {
  requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  authUrl(state) {
    return `https://accounts.google.com/o/oauth2/v2/auth?${qs({
      client_id: env("GOOGLE_CLIENT_ID"),
      redirect_uri: redirectUri("youtube"),
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    })}`;
  },
  async callback(code) {
    const t = await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri("youtube") });
    const { data } = await request("YouTube", "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${t.accessToken}` },
    });
    const ch = data.items?.[0];
    if (!ch) throw new Error("This Google account has no YouTube channel. Create one first.");
    return [{
      platform: "youtube",
      externalId: ch.id,
      name: ch.snippet.title,
      username: ch.snippet.customUrl,
      avatarUrl: ch.snippet.thumbnails?.default?.url,
      ...t,
    }];
  },
};

export const youtubePublisher: PublishAdapter = {
  refreshWindowMs: 5 * 60_000,
  async refresh({ refreshToken }) {
    if (!refreshToken) return null;
    const t = await token({ grant_type: "refresh_token", refresh_token: refreshToken });
    return { ...t, refreshToken: t.refreshToken ?? refreshToken };
  },
  async publish({ account, text, title, media }: PublishInput) {
    const video = media.find((m) => m.kind === "video");
    if (!video) throw new Error("YouTube needs a video");
    const finalTitle = (title?.trim() || text.split("\n")[0] || "New video").slice(0, 100);

    const { res } = await request("YouTube", `https://www.googleapis.com/upload/youtube/v3/videos?${qs({ uploadType: "resumable", part: "snippet,status" })}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": video.mimeType,
        "X-Upload-Content-Length": String(video.size),
      },
      body: JSON.stringify({
        snippet: { title: finalTitle, description: text.slice(0, 5000), categoryId: "22" },
        status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
      }),
    });
    const uploadUrl = res.headers.get("location");
    if (!uploadUrl) throw new Error("YouTube: no upload URL returned");

    const { data } = await request("YouTube", uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": video.mimeType, "Content-Length": String(video.size) },
      body: await mediaBody(video),
    });
    return { id: data.id, url: `https://www.youtube.com/watch?v=${data.id}` };
  },
};
