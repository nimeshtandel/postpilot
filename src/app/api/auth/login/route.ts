import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { needsRehash } from "@/lib/crypto";

const Body = z.object({
  email: z.string().transform((e) => e.trim().toLowerCase()),
  password: z.string(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email));
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash)))
    return Response.json({ error: "Wrong email or password" }, { status: 401 });
  // Strengthen older hashes after a plan upgrade raises PASSWORD_HASH_ITERATIONS.
  if (needsRehash(user.passwordHash))
    await db.update(users).set({ passwordHash: await hashPassword(parsed.data.password) }).where(eq(users.id, user.id));
  await createSession(user.id);
  return Response.json({ ok: true });
}
