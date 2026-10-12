// Threads API (graph.threads.net). Long-lived tokens last ~60 days and can be refreshed.
import { env, redirectUri } from "../env";
import { form, poll, qs, request, sleep } from "./http";
import type { ConnectAdapter, PublishAdapter, PublishInput } from "./types";

const API = "https://graph.threads.net";

export const threadsConnect: ConnectAdapter = {
  requiredEnv: ["THREADS_APP_ID", "THREADS_APP_SECRET"],
  authUrl(state) {
    return `https://threads.net/oauth/authorize?${qs({
      client_id: env("THREADS_APP_ID"),
      redirect_uri: redirectUri("threads"),
      scope: "threads_basic,threads_content_publish",
      response_type: "code",
      state,
    })}`;
  },
  async callback(code) {
    const { data: short } = await request("Threads", `${API}/oauth/access_token`, {
      method: "POST",
      body: form({
        client_id: env("THREADS_APP_ID"),
        client_secret: env("THREADS_APP_SECRET"),
        grant_type: "authorization_code",
        redirect_uri: redirectUri("threads"),
        code,
      }),
    });
    const { data: long } = await request("Threads", `${API}/access_token?${qs({
      grant_type: "th_exchange_token",
      client_secret: env("THREADS_APP_SECRET"),
      access_token: short.access_token,
    })}`);
    const { data: me } = await request("Threads", `${API}/v1.0/me?${qs({
      fields: "id,username,name,threads_profile_picture_url",
      access_token: long.access_token,
    })}`);
    return [{
      platform: "threads",
      externalId: me.id,
      name: me.name || me.username,
      username: me.username,
      avatarUrl: me.threads_profile_picture_url,
      accessToken: long.access_token,
      tokenExpiresAt: new Date(Date.now() + (long.expires_in ?? 5_184_000) * 1000),
    }];
  },
};

export const threadsPublisher: PublishAdapter = {
  refreshWindowMs: 7 * 24 * 3600_000, // refresh a week before expiry
  async refresh({ accessToken }) {
    const { data } = await request("Threads", `${API}/refresh_access_token?${qs({
      grant_type: "th_refresh_token",
      access_token: accessToken,
    })}`);
    return { accessToken: data.access_token, tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000) };
  },

  async publish({ account, text, media }: PublishInput) {
    const uid = account.externalId;
    const token = account.accessToken;
    const create = async (params: Record<string, string | undefined>) => {
      const { data } = await request("Threads", `${API}/v1.0/${uid}/threads`, {
        method: "POST",
        body: form({ ...params, access_token: token }),
      });
      return data.id as string;
    };
    const waitReady = (id: string) =>
      poll(
        async () => {
          const { data } = await request("Threads", `${API}/v1.0/${id}?${qs({ fields: "status,error_message", access_token: token })}`);
          if (data.status === "FINISHED") return true;
          if (data.status === "ERROR" || data.status === "EXPIRED") throw new Error(`Threads media failed: ${data.error_message ?? data.status}`);
          return undefined;
        },
        { intervalMs: 10_000, timeoutMs: 8 * 60_000, what: "Threads media processing" },
      );

    let containerId: string;
    if (media.length === 0) {
      containerId = await create({ media_type: "TEXT", text });
    } else if (media.length === 1) {
      const m = media[0];
      containerId = await create(
        m.kind === "video" ? { media_type: "VIDEO", video_url: m.url, text } : { media_type: "IMAGE", image_url: m.url, text },
      );
    } else {
      const children: string[] = [];
      for (const m of media) {
        const id = await create(
          m.kind === "video"
            ? { media_type: "VIDEO", video_url: m.url, is_carousel_item: "true" }
            : { media_type: "IMAGE", image_url: m.url, is_carousel_item: "true" },
        );
        children.push(id);
      }
      for (const id of children) await waitReady(id);
      containerId = await create({ media_type: "CAROUSEL", children: children.join(","), text });
    }

    if (media.length) await waitReady(containerId);
    else await sleep(2000);

    const { data } = await request("Threads", `${API}/v1.0/${uid}/threads_publish`, {
      method: "POST",
      body: form({ creation_id: containerId, access_token: token }),
    });
    let url: string | undefined;
    try {
      const { data: p } = await request("Threads", `${API}/v1.0/${data.id}?${qs({ fields: "permalink", access_token: token })}`);
      url = p.permalink;
    } catch {}
    return { id: data.id, url };
  },
};
