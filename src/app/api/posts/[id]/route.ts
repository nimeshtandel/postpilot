import { and, eq, ne, sql } from "drizzle-orm";
import { db, posts, postTargets } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { PostInput, preparePost } from "@/lib/posts";

type Ctx = { params: Promise<{ id: string }> };
const EDITABLE = ["draft", "scheduled", "failed"];

// PATCH /api/posts/:id → edit a draft / scheduled / failed post
export async function PATCH(req: Request, ctx: Ctx) {
  const userId = await apiUser();
  if (userId instanceof Response) return userId;
  const { id } = await ctx.params;

  const [existing] = await db.select().from(posts).where(and(eq(posts.id, id), eq(posts.userId, userId)));
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
  if (!EDITABLE.includes(existing.status))
    return Response.json({ error: `A ${existing.status} post can't be edited` }, { status: 409 });

  const parsed = PostInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const prepared = await preparePost(userId, parsed.data);
  if ("error" in prepared) return Response.json({ error: prepared.error }, { status: 400 });

  // Re-check the status inside the atomic batch: if the publisher claimed the post in the meantime,
  // the guard below fails the whole batch and nothing changes.
  try {
    await db.batch([
      // json_extract on malformed JSON raises an error, aborting the batch, only when the status changed.
      db
        .select({ ok: sql`json_extract(CASE WHEN ${posts.status} = ${existing.status} THEN '1' ELSE 'not json' END, '$')` })
        .from(posts)
        .where(eq(posts.id, id)),
      db.update(posts).set(prepared.data).where(eq(posts.id, id)),
      db.delete(postTargets).where(eq(postTargets.postId, id)),
      db.insert(postTargets).values(prepared.targets.map((t) => ({ ...t, postId: id }))),
    ]);
  } catch (e) {
    const msg = String((e as any)?.cause?.message ?? (e as any)?.message ?? e);
    if (msg.includes("malformed JSON")) return Response.json({ error: "This post just started publishing" }, { status: 409 });
    console.error("[posts:edit]", e);
    return Response.json({ error: "Couldn't save your changes, please try again" }, { status: 500 });
  }
  return Response.json({ id, status: prepared.data.status });
}

// DELETE /api/posts/:id → delete from PostPilot (does not delete what's already live on the platforms)
export async function DELETE(_req: Request, ctx: Ctx) {
  const userId = await apiUser();
  if (userId instanceof Response) return userId;
  const { id } = await ctx.params;
  const deleted = await db
    .delete(posts)
    .where(and(eq(posts.id, id), eq(posts.userId, userId), ne(posts.status, "publishing")))
    .returning({ id: posts.id });
  if (!deleted.length) return Response.json({ error: "Not found or currently publishing" }, { status: 404 });
  return Response.json({ ok: true });
}
