// TikTok Content Posting API — Direct Post with FILE_UPLOAD.
// Until your app passes TikTok's audit, posts can only be SELF_ONLY (private).
import { env, envOr, redirectUri } from "../env";
import { mediaBody } from "../media";
import { form, poll, qs, request } from "./http";
import type { ConnectAdapter, PublishAdapter, PublishInput } from "./types";

const API = "https://open.tiktokapis.com/v2";
const MB = 1024 * 1024;

async function token(params: Record<string, string>) {
  const { data } = await request("TikTok", `${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form({ client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"), ...params }),
  });
  if (data.error && data.error !== "ok" && !data.access_token) throw new Error(`TikTok: ${data.error_description ?? data.error}`);
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
    openId: data.open_id as string,
  };
}

export const tiktokConnect: ConnectAdapter = {
  requiredEnv: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  authUrl(state) {
    return `https://www.tiktok.com/v2/auth/authorize/?${qs({
      client_key: env("TIKTOK_CLIENT_KEY"),
      scope: "user.info.basic,video.publish",
      response_type: "code",
      redirect_uri: redirectUri("tiktok"),
      state,
    })}`;
  },
  async callback(code) {
    const { openId, ...t } = await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri("tiktok") });
    const { data } = await request("TikTok", `${API}/user/info/?fields=open_id,display_name,avatar_url,username`, {
      headers: { Authorization: `Bearer ${t.accessToken}` },
    });
    const u = data.data.user;
    return [{
      platform: "tiktok",
      externalId: u.open_id ?? openId,
      name: u.display_name,
      username: u.username,
      avatarUrl: u.avatar_url,
      ...t,
    }];
  },
};

/** TikTok chunk rules: ≤64MB → single chunk; otherwise 5–64MB chunks, last chunk absorbs the remainder. */
function chunkPlan(size: number) {
  if (size <= 64 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 10 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

export const tiktokPublisher: PublishAdapter = {
  refreshWindowMs: 10 * 60_000,
  async refresh({ refreshToken }) {
    if (!refreshToken) return null;
    const { openId: _, ...t } = await token({ grant_type: "refresh_token", refresh_token: refreshToken });
    return t;
  },
  async publish({ account, text, media }: PublishInput) {
    const video = media.find((m) => m.kind === "video");
    if (!video) throw new Error("TikTok needs a video");
    const auth = { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json; charset=UTF-8" };

    // Pick a privacy level the creator is allowed to use.
    const { data: creator } = await request("TikTok", `${API}/post/publish/creator_info/query/`, { method: "POST", headers: auth });
    const allowed: string[] = creator.data?.privacy_level_options ?? ["SELF_ONLY"];
    const wanted = envOr("TIKTOK_PRIVACY_LEVEL", "SELF_ONLY");
    const privacy = allowed.includes(wanted) ? wanted : allowed.includes("SELF_ONLY") ? "SELF_ONLY" : allowed[0];

    const size = video.size;
    const { chunkSize, count } = chunkPlan(size);
    const { data: init } = await request("TikTok", `${API}/post/publish/video/init/`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        post_info: { title: text.slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
        source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: count },
      }),
    });
    const { publish_id, upload_url } = init.data;

    for (let i = 0; i < count; i++) {
      const start = i * chunkSize;
      const end = i === count - 1 ? size : start + chunkSize; // last chunk takes the remainder
      const res = await fetch(upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": video.mimeType,
          "Content-Length": String(end - start),
          "Content-Range": `bytes ${start}-${end - 1}/${size}`,
        },
        body: await mediaBody(video, start, end),
      });
      if (!res.ok) throw new Error(`TikTok: chunk ${i + 1}/${count} upload failed (${res.status})`);
    }

    // Wait for TikTok to accept the post. Processing can continue after this.
    const postId = await poll(
      async () => {
        const { data } = await request("TikTok", `${API}/post/publish/status/fetch/`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ publish_id }),
        });
        const s = data.data?.status;
        if (s === "FAILED") throw new Error(`TikTok rejected the video: ${data.data?.fail_reason ?? "unknown reason"}`);
        if (s === "PUBLISH_COMPLETE") return String(data.data?.publicaly_available_post_id?.[0] ?? publish_id);
        if (s === "SEND_TO_USER_INBOX") return publish_id;
        return undefined;
      },
      { intervalMs: 10_000, timeoutMs: 3 * 60_000, what: "TikTok processing" },
    ).catch((e) => {
      // If TikTok is still processing after 5 min, treat upload as accepted.
      if (String(e.message).startsWith("Timed out")) return publish_id as string;
      throw e;
    });

    const handle = account.meta.username;
    return { id: postId, url: handle && postId !== publish_id ? `https://www.tiktok.com/@${handle}/video/${postId}` : undefined };
  },
};
