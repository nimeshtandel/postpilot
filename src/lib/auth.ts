import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db, users } from "./db";
import { env } from "./env";
export { hashPassword, verifyPassword } from "./crypto";

const COOKIE = "pp_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  return new TextEncoder().encode(env("AUTH_SECRET"));
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function getUser() {
  const id = await getUserId();
  if (!id) return null;
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, timezone: users.timezone })
    .from(users)
    .where(eq(users.id, id));
  return user ?? null;
}

/** For server components/pages: redirect to /login when signed out. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** For API routes: returns the user id or a 401 Response. */
export async function apiUser(): Promise<string | Response> {
  const id = await getUserId();
  return id ?? Response.json({ error: "Not signed in" }, { status: 401 });
}
