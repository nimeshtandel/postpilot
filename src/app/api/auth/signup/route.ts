import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  timezone: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { name, email, password, timezone } = parsed.data;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return Response.json({ error: "An account with that email already exists" }, { status: 409 });

  const validTz = timezone && Intl.supportedValuesOf("timeZone").includes(timezone) ? timezone : undefined;
  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash: await hashPassword(password), ...(validTz ? { timezone: validTz } : {}) })
    .returning({ id: users.id });
  await createSession(user.id);
  return Response.json({ ok: true });
}
