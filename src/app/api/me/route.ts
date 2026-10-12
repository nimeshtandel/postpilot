import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { apiUser } from "@/lib/auth";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  timezone: z.string().refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz) || tz === "UTC", "Unknown time zone"),
});

export async function PATCH(req: Request) {
  const userId = await apiUser();
  if (userId instanceof Response) return userId;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  await db.update(users).set(parsed.data).where(eq(users.id, userId));
  return Response.json({ ok: true });
}
