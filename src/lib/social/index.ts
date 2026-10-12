import { eq } from "drizzle-orm";
import { db, socialAccounts, type SocialAccount } from "../db";
import { decrypt, encrypt } from "../crypto";
import { readVar } from "../env";
import type { Platform } from "../platforms";
import { facebookPublisher, instagramPublisher, metaConnect } from "./meta";
import { threadsConnect, threadsPublisher } from "./threads";
import { linkedinConnect, linkedinPublisher } from "./linkedin";
import { xConnect, xPublisher } from "./x";
import { youtubeConnect, youtubePublisher } from "./youtube";
import { tiktokConnect, tiktokPublisher } from "./tiktok";
import type { ConnectAdapter, ConnectedProfile, PublishAdapter } from "./types";

export const CONNECTORS: Partial<Record<Platform, ConnectAdapter>> = {
  facebook: metaConnect,
  threads: threadsConnect,
  linkedin: linkedinConnect,
  x: xConnect,
  youtube: youtubeConnect,
  tiktok: tiktokConnect,
};

export const PUBLISHERS: Record<Platform, PublishAdapter> = {
  facebook: facebookPublisher,
  instagram: instagramPublisher,
  threads: threadsPublisher,
  linkedin: linkedinPublisher,
  x: xPublisher,
  youtube: youtubePublisher,
  tiktok: tiktokPublisher,
};

export function isConfigured(platform: Platform): boolean {
  const c = CONNECTORS[platform];
  return !!c && c.requiredEnv.every((k) => !!readVar(k));
}

/** Upsert profiles found during OAuth. Reconnecting refreshes tokens and reactivates the account. */
export async function saveProfiles(userId: string, profiles: ConnectedProfile[]) {
  for (const p of profiles) {
    const data = {
      name: p.name,
      username: p.username ?? null,
      avatarUrl: p.avatarUrl ?? null,
      accessToken: await encrypt(p.accessToken),
      refreshToken: p.refreshToken ? await encrypt(p.refreshToken) : null,
      tokenExpiresAt: p.tokenExpiresAt ?? null,
      meta: p.meta ? JSON.stringify(p.meta) : null,
      status: "active",
    };
    await db
      .insert(socialAccounts)
      .values({ userId, platform: p.platform, externalId: p.externalId, ...data })
      .onConflictDoUpdate({
        target: [socialAccounts.userId, socialAccounts.platform, socialAccounts.externalId],
        set: { ...data, updatedAt: new Date() },
      });
  }
}

/** Decrypt an account's token, refreshing it first if it is close to expiry. */
export async function getFreshAccessToken(account: SocialAccount): Promise<string> {
  const publisher = PUBLISHERS[account.platform as Platform];
  let accessToken = await decrypt(account.accessToken);
  const refreshToken = account.refreshToken ? await decrypt(account.refreshToken) : null;
  const window = publisher.refreshWindowMs ?? 5 * 60_000;
  const expiresSoon = account.tokenExpiresAt && account.tokenExpiresAt.getTime() - Date.now() < window;

  if (expiresSoon && publisher.refresh) {
    const fresh = await publisher.refresh({ accessToken, refreshToken });
    if (fresh) {
      accessToken = fresh.accessToken;
      await db
        .update(socialAccounts)
        .set({
          accessToken: await encrypt(fresh.accessToken),
          ...(fresh.refreshToken ? { refreshToken: await encrypt(fresh.refreshToken) } : {}),
          tokenExpiresAt: fresh.tokenExpiresAt ?? null,
          status: "active",
        })
        .where(eq(socialAccounts.id, account.id));
    } else if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() < Date.now()) {
      await db.update(socialAccounts).set({ status: "expired" }).where(eq(socialAccounts.id, account.id));
      throw new Error(`${account.name}: connection expired, please reconnect this account`);
    }
  }
  return accessToken;
}

export function accountMeta(account: SocialAccount): Record<string, any> {
  const meta = account.meta ? JSON.parse(account.meta) : {};
  return { ...meta, username: account.username };
}
