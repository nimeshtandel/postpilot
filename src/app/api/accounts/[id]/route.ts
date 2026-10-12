import { and, eq } from "drizzle-orm";
import { db, socialAccounts } from "@/lib/db";
import { apiUser } from "@/lib/auth";

// DELETE /api/accounts/:id → disconnect an account (its post targets are removed too).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await apiUser();
  if (userId instanceof Response) return userId;
  const { id } = await ctx.params;
  const deleted = await db
    .delete(socialAccounts)
    .where(and(eq(socialAccounts.id, id), eq(socialAccounts.userId, userId)))
    .returning({ id: socialAccounts.id });
  if (!deleted.length) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
