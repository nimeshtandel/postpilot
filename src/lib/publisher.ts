// Publishing engine shared by the background worker and the /api/cron/publish route.
import { and, asc, eq, inArray, lt, lte } from "drizzle-orm";
import { db, media as mediaTable, posts, postTargets, socialAccounts } from "./db";
import { toMediaItem } from "./media";
import type { Platform } from "./platforms";
import { accountMeta, getFreshAccessToken, PUBLISHERS } from "./social";
import { PlatformError } from "./social/http";

const MAX_ATTEMPTS = 3;

async function loadMedia(userId: string, mediaIdsJson: string) {
  const ids: string[] = JSON.parse(mediaIdsJson || "[]");
  if (!ids.length) return [];
  const rows = await db.select().from(mediaTable).where(and(inArray(mediaTable.id, ids), eq(mediaTable.userId, userId)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const m = byId.get(id);
    return m ? [toMediaItem(m)] : [];
  });
}

/** Publish one post to every target that hasn't succeeded yet. */
export async function publishPost(postId: string) {
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
    with: { targets: { with: { account: true } } },
  });
  if (!post) return;
  const media = await loadMedia(post.userId, post.mediaIds);

  for (const target of post.targets) {
    if (target.status === "published" || target.attempts >= MAX_ATTEMPTS) continue;
    const { account } = target;
    try {
      const accessToken = await getFreshAccessToken(account);
      const result = await PUBLISHERS[account.platform as Platform].publish({
        account: { externalId: account.externalId, accessToken, meta: accountMeta(account) },
        text: target.contentOverride ?? post.content,
        title: post.title,
        media,
      });
      await db
        .update(postTargets)
        .set({
          status: "published",
          externalPostId: result.id,
          externalUrl: result.url ?? null,
          error: null,
          attempts: target.attempts + 1,
          publishedAt: new Date(),
        })
        .where(eq(postTargets.id, target.id));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[publish] post=${post.id} account=${account.id}`, message);
      if (e instanceof PlatformError && e.authExpired)
        await db.update(socialAccounts).set({ status: "expired" }).where(eq(socialAccounts.id, account.id));
      await db
        .update(postTargets)
        .set({ status: "failed", error: message.slice(0, 1000), attempts: target.attempts + 1 })
        .where(eq(postTargets.id, target.id));
    }
  }

  const targets = await db.select({ status: postTargets.status }).from(postTargets).where(eq(postTargets.postId, postId));
  const ok = targets.filter((t) => t.status === "published").length;
  const status = ok === targets.length ? "published" : ok === 0 ? "failed" : "partial";
  await db.update(posts).set({ status, publishedAt: ok ? new Date() : null }).where(eq(posts.id, postId));
  return status;
}

/** Find due posts, claim each atomically (so two workers never double-post), and publish. */
export async function publishDuePosts(limit = 10) {
  // Recover posts stuck in "publishing" (e.g. the worker crashed mid-run).
  await db
    .update(posts)
    .set({ status: "scheduled" })
    .where(and(eq(posts.status, "publishing"), lt(posts.updatedAt, new Date(Date.now() - 30 * 60_000))));

  const due = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, new Date())))
    .orderBy(asc(posts.scheduledAt))
    .limit(limit);

  const results: { id: string; status?: string }[] = [];
  for (const { id } of due) {
    const claimed = await db
      .update(posts)
      .set({ status: "publishing" })
      .where(and(eq(posts.id, id), eq(posts.status, "scheduled")))
      .returning({ id: posts.id });
    if (!claimed.length) continue; // another worker got it
    results.push({ id, status: await publishPost(id) });
  }
  return results;
}
