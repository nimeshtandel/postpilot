import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db, media as mediaTable, socialAccounts } from "./db";
import { PLATFORM_INFO, validateForPlatform, type Platform } from "./platforms";

export const PostInput = z.object({
  content: z.string().max(63206).default(""),
  title: z.string().max(100).optional().nullable(),
  mediaIds: z.array(z.string()).max(10).default([]),
  targets: z
    .array(z.object({ accountId: z.string(), contentOverride: z.string().max(63206).optional().nullable() }))
    .min(1, "Pick at least one account"),
  /** draft = save only; schedule = publish at scheduledAt; now = publish right away */
  action: z.enum(["draft", "schedule", "now"]),
  scheduledAt: z.iso.datetime({ offset: true }).optional().nullable(),
});
export type PostInputT = z.infer<typeof PostInput>;

/** Validate a post against the user's accounts + media and build the DB payload. */
export async function preparePost(userId: string, input: PostInputT) {
  const accountIds = [...new Set(input.targets.map((t) => t.accountId))];
  const accounts = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.userId, userId), inArray(socialAccounts.id, accountIds)));
  if (accounts.length !== input.targets.length) return { error: "One of the selected accounts no longer exists" };

  const media = input.mediaIds.length
    ? await db.select().from(mediaTable).where(and(eq(mediaTable.userId, userId), inArray(mediaTable.id, input.mediaIds)))
    : [];
  if (media.length !== new Set(input.mediaIds).size) return { error: "One of the media files no longer exists" };

  let scheduledAt: Date | null = null;
  if (input.action === "schedule") {
    if (!input.scheduledAt) return { error: "Pick a date and time" };
    scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt.getTime() < Date.now() - 60_000) return { error: "That time is in the past" };
  } else if (input.action === "now") {
    scheduledAt = new Date();
  }

  if (input.action !== "draft") {
    const problems: string[] = [];
    for (const t of input.targets) {
      const acc = accounts.find((a) => a.id === t.accountId)!;
      if (acc.status === "expired") problems.push(`${acc.name}: connection expired, reconnect it first`);
      const text = t.contentOverride ?? input.content;
      problems.push(...validateForPlatform(acc.platform as Platform, text, media));
    }
    if (problems.length) return { error: [...new Set(problems)].join(" · ") };
  }

  return {
    data: {
      content: input.content,
      title: input.title || null,
      mediaIds: JSON.stringify(input.mediaIds),
      status: input.action === "draft" ? "draft" : "scheduled",
      scheduledAt: input.action === "draft" ? (input.scheduledAt ? new Date(input.scheduledAt) : null) : scheduledAt,
    },
    targets: input.targets.map((t) => ({
      accountId: t.accountId,
      contentOverride: t.contentOverride?.trim() ? t.contentOverride : null,
    })),
  };
}

export function platformName(p: string) {
  return PLATFORM_INFO[p as Platform]?.name ?? p;
}
