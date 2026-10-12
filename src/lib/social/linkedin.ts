// LinkedIn member posting via the versioned REST Posts API (w_member_social).
import { env, envOr, redirectUri } from "../env";
import { readMedia } from "../media";
import { form, qs, request } from "./http";
import type { ConnectAdapter, PublishAdapter, PublishInput } from "./types";

const restHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "LinkedIn-Version": envOr("LINKEDIN_API_VERSION", "202605"),
  "X-Restli-Protocol-Version": "2.0.0",
  "Content-Type": "application/json",
});

/** LinkedIn "little text" format reserves these characters; they must be backslash-escaped. */
export function escapeLinkedIn(text: string): string {
  return text.replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => `\\${c}`);
}

export const linkedinConnect: ConnectAdapter = {
  requiredEnv: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  authUrl(state) {
    return `https://www.linkedin.com/oauth/v2/authorization?${qs({
      response_type: "code",
      client_id: env("LINKEDIN_CLIENT_ID"),
      redirect_uri: redirectUri("linkedin"),
      state,
      scope: "openid profile w_member_social",
    })}`;
  },
  async callback(code) {
    const { data: tok } = await request("LinkedIn", "https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      body: form({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri("linkedin"),
        client_id: env("LINKEDIN_CLIENT_ID"),
        client_secret: env("LINKEDIN_CLIENT_SECRET"),
      }),
    });
    const { data: me } = await request("LinkedIn", "https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    return [{
      platform: "linkedin",
      externalId: me.sub,
      name: me.name,
      avatarUrl: me.picture,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      tokenExpiresAt: new Date(Date.now() + tok.expires_in * 1000),
    }];
  },
};

export const linkedinPublisher: PublishAdapter = {
  async refresh({ refreshToken }) {
    // Only apps approved for programmatic refresh tokens get one; otherwise the user reconnects every 60 days.
    if (!refreshToken) return null;
    const { data } = await request("LinkedIn", "https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      body: form({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: env("LINKEDIN_CLIENT_ID"),
        client_secret: env("LINKEDIN_CLIENT_SECRET"),
      }),
    });
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  },

  async publish({ account, text, media }: PublishInput) {
    const token = account.accessToken;
    const author = `urn:li:person:${account.externalId}`;
    let content: Record<string, unknown> | undefined;

    const image = media.find((m) => m.kind === "image");
    if (image) {
      const { data: init } = await request("LinkedIn", "https://api.linkedin.com/rest/images?action=initializeUpload", {
        method: "POST",
        headers: restHeaders(token),
        body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
      });
      const bytes = await readMedia(image);
      const up = await fetch(init.value.uploadUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": image.mimeType },
        body: bytes,
      });
      if (!up.ok) throw new Error(`LinkedIn: image upload failed (${up.status})`);
      content = { media: { id: init.value.image } };
    }

    const { res } = await request("LinkedIn", "https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: restHeaders(token),
      body: JSON.stringify({
        author,
        commentary: escapeLinkedIn(text),
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
        ...(content ? { content } : {}),
      }),
    });
    const id = res.headers.get("x-restli-id") ?? "";
    return { id, url: id ? `https://www.linkedin.com/feed/update/${id}/` : undefined };
  },
};
