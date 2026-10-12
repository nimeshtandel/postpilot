// Facebook Pages + Instagram (professional accounts linked to a Page), via the Meta Graph API.
// One OAuth flow connects every Page the user manages and each Page's linked Instagram account.
import { env, envOr, redirectUri } from "../env";
import { form, poll, qs, request } from "./http";
import type { ConnectAdapter, ConnectedProfile, PublishAdapter, PublishInput } from "./types";

const v = () => envOr("META_GRAPH_VERSION", "v23.0");
const graph = (path: string) => `https://graph.facebook.com/${v()}${path}`;

const SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
];

export const metaConnect: ConnectAdapter = {
  requiredEnv: ["META_APP_ID", "META_APP_SECRET"],
  authUrl(state) {
    return `https://www.facebook.com/${v()}/dialog/oauth?${qs({
      client_id: env("META_APP_ID"),
      redirect_uri: redirectUri("facebook"),
      state,
      response_type: "code",
      scope: SCOPES.join(","),
    })}`;
  },

  async callback(code) {
    const { data: short } = await request("Facebook", graph(`/oauth/access_token?${qs({
      client_id: env("META_APP_ID"),
      client_secret: env("META_APP_SECRET"),
      redirect_uri: redirectUri("facebook"),
      code,
    })}`));
    // Exchange for a long-lived user token so the Page tokens we derive don't expire.
    const { data: long } = await request("Facebook", graph(`/oauth/access_token?${qs({
      grant_type: "fb_exchange_token",
      client_id: env("META_APP_ID"),
      client_secret: env("META_APP_SECRET"),
      fb_exchange_token: short.access_token,
    })}`));

    const { data: pages } = await request("Facebook", graph(`/me/accounts?${qs({
      fields: "id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}",
      limit: 100,
      access_token: long.access_token,
    })}`));

    const profiles: ConnectedProfile[] = [];
    for (const p of pages.data ?? []) {
      profiles.push({
        platform: "facebook",
        externalId: p.id,
        name: p.name,
        avatarUrl: p.picture?.data?.url,
        accessToken: p.access_token,
      });
      const ig = p.instagram_business_account;
      if (ig) {
        profiles.push({
          platform: "instagram",
          externalId: ig.id,
          name: ig.name || ig.username,
          username: ig.username,
          avatarUrl: ig.profile_picture_url,
          accessToken: p.access_token, // IG publishing uses the linked Page's token
          meta: { pageId: p.id },
        });
      }
    }
    if (!profiles.length)
      throw new Error("No Facebook Pages found. You need to manage at least one Page (and grant it access during login).");
    return profiles;
  },
};

// ─── Facebook Page publishing ───────────────────────────────────────────

export const facebookPublisher: PublishAdapter = {
  async publish({ account, text, media }: PublishInput) {
    const page = account.externalId;
    const token = account.accessToken;
    const post = (path: string, params: Record<string, string | undefined>) =>
      request("Facebook", graph(path), { method: "POST", body: form({ ...params, access_token: token }) });

    const video = media.find((m) => m.kind === "video");
    if (video) {
      const { data } = await post(`/${page}/videos`, { file_url: video.url, description: text });
      return { id: data.id, url: `https://www.facebook.com/${data.id}` };
    }

    const images = media.filter((m) => m.kind === "image");
    if (images.length === 1) {
      const { data } = await post(`/${page}/photos`, { url: images[0].url, caption: text });
      const id = data.post_id || data.id;
      return { id, url: `https://www.facebook.com/${id}` };
    }

    const params: Record<string, string | undefined> = { message: text };
    if (images.length > 1) {
      // Upload each photo unpublished, then attach them all to one feed post.
      for (let i = 0; i < images.length; i++) {
        const { data } = await post(`/${page}/photos`, { url: images[i].url, published: "false" });
        params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: data.id });
      }
    }
    const { data } = await post(`/${page}/feed`, params);
    return { id: data.id, url: `https://www.facebook.com/${data.id}` };
  },
};

// ─── Instagram publishing (container → publish) ─────────────────────────

async function waitForContainer(id: string, token: string) {
  await poll(
    async () => {
      const { data } = await request("Instagram", graph(`/${id}?${qs({ fields: "status_code,status", access_token: token })}`));
      if (data.status_code === "FINISHED") return true;
      if (data.status_code === "ERROR" || data.status_code === "EXPIRED")
        throw new Error(`Instagram couldn't process the media: ${data.status ?? data.status_code}`);
      return undefined;
    },
    { intervalMs: 10_000, timeoutMs: 8 * 60_000, what: "Instagram media processing" },
  );
}

export const instagramPublisher: PublishAdapter = {
  async publish({ account, text, media }: PublishInput) {
    const ig = account.externalId;
    const token = account.accessToken;
    const create = async (params: Record<string, string | undefined>) => {
      const { data } = await request("Instagram", graph(`/${ig}/media`), {
        method: "POST",
        body: form({ ...params, access_token: token }),
      });
      return data.id as string;
    };

    let containerId: string;
    if (media.length === 1) {
      const m = media[0];
      containerId =
        m.kind === "video"
          ? await create({ media_type: "REELS", video_url: m.url, caption: text, share_to_feed: "true" })
          : await create({ image_url: m.url, caption: text });
    } else {
      const children: string[] = [];
      for (const m of media) {
        const id =
          m.kind === "video"
            ? await create({ media_type: "VIDEO", video_url: m.url, is_carousel_item: "true" })
            : await create({ image_url: m.url, is_carousel_item: "true" });
        await waitForContainer(id, token);
        children.push(id);
      }
      containerId = await create({ media_type: "CAROUSEL", children: children.join(","), caption: text });
    }

    await waitForContainer(containerId, token);
    const { data: published } = await request("Instagram", graph(`/${ig}/media_publish`), {
      method: "POST",
      body: form({ creation_id: containerId, access_token: token }),
    });

    let url: string | undefined;
    try {
      const { data } = await request("Instagram", graph(`/${published.id}?${qs({ fields: "permalink", access_token: token })}`));
      url = data.permalink;
    } catch {
      /* permalink is nice-to-have */
    }
    return { id: published.id, url };
  },
};
