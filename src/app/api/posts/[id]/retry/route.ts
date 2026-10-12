import { and, eq, inArray } from "drizzle-orm";
import { db, posts, postTargets } from "@/lib/db";
import { apiUser } from "@/lib/auth";

// POST /api/posts/:id/retry → re-queue failed targets; the worker publishes them within ~30s.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await apiUser();
  if (userId instanceof Response) return userId;
  const { id } = await ctx.params;

  const where = and(eq(posts.id, id), eq(posts.userId, userId), inArray(posts.status, ["failed", "partial"]));
  const [post] = await db.select({ id: posts.id }).from(posts).where(where);
  if (!post) return Response.json({ error: "Only failed posts can be retried" }, { status: 400 });

  // Reset targets first, then hand the post back to the worker.
  await db.batch([
    db
      .update(postTargets)
      .set({ status: "pending", attempts: 0, error: null })
      .where(and(eq(postTargets.postId, id), eq(postTargets.status, "failed"))),
    db.update(posts).set({ status: "scheduled", scheduledAt: new Date() }).where(where),
  ]);
  return Response.json({ ok: true });
}
