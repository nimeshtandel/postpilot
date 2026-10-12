import { db, posts, postTargets } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { PostInput, preparePost } from "@/lib/posts";

// POST /api/posts → create a draft, scheduled or publish-now post
export async function POST(req: Request) {
  const userId = await apiUser();
  if (userId instanceof Response) return userId;

  const parsed = PostInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const prepared = await preparePost(userId, parsed.data);
  if ("error" in prepared) return Response.json({ error: prepared.error }, { status: 400 });

  // D1 runs a batch as one atomic transaction.
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(posts).values({ id, userId, ...prepared.data }),
    db.insert(postTargets).values(prepared.targets.map((t) => ({ ...t, postId: id }))),
  ]);
  return Response.json({ id, status: prepared.data.status });
}
