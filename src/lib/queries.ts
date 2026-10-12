// Read queries shared by the server-rendered pages.
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { db, posts, socialAccounts } from "./db";

const withTargets = {
  targets: { with: { account: { columns: { name: true, platform: true } } } },
} as const;

export function listAccounts(userId: string) {
  return db.select().from(socialAccounts).where(eq(socialAccounts.userId, userId)).orderBy(asc(socialAccounts.platform), asc(socialAccounts.name));
}

export function listPosts(userId: string, statuses: string[], order: "scheduled" | "recent", limit = 100) {
  return db.query.posts.findMany({
    where: and(eq(posts.userId, userId), inArray(posts.status, statuses)),
    orderBy: order === "scheduled" ? asc(posts.scheduledAt) : desc(posts.updatedAt),
    limit,
    with: withTargets,
  });
}

export async function countPosts(userId: string, status: string, since?: Date) {
  const [row] = await db
    .select({ n: count() })
    .from(posts)
    .where(and(eq(posts.userId, userId), eq(posts.status, status), since ? gte(posts.publishedAt, since) : undefined));
  return row.n;
}

/** Posts whose publish (or scheduled) time falls within [from, to). */
export function postsInRange(userId: string, from: Date, to: Date) {
  return db.query.posts.findMany({
    where: and(
      eq(posts.userId, userId),
      or(
        and(gte(posts.publishedAt, from), lt(posts.publishedAt, to)),
        and(isNull(posts.publishedAt), gte(posts.scheduledAt, from), lt(posts.scheduledAt, to)),
      ),
    ),
    orderBy: asc(posts.scheduledAt),
    with: { targets: { columns: {}, with: { account: { columns: { platform: true } } } } },
  });
}
