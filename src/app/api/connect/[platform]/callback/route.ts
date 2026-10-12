import { eq } from "drizzle-orm";
import { db, oauthStates } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { isPlatform, PLATFORM_INFO } from "@/lib/platforms";
import { CONNECTORS, saveProfiles } from "@/lib/social";

const back = (params: Record<string, string>) =>
  Response.redirect(`${appUrl()}/accounts?${new URLSearchParams(params)}`, 303);

// GET /api/connect/:platform/callback?code=…&state=…
export async function GET(req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error_description") || url.searchParams.get("error");

  if (denied) return back({ error: `Connection cancelled: ${denied}` });
  if (!isPlatform(platform) || !CONNECTORS[platform] || !code || !state) return back({ error: "Invalid callback" });

  const [saved] = await db.delete(oauthStates).where(eq(oauthStates.state, state)).returning();
  const userId = await getUserId();
  if (!saved || saved.platform !== platform || !userId || saved.userId !== userId)
    return back({ error: "Login session mismatch or expired, please try again" });

  try {
    const profiles = await CONNECTORS[platform]!.callback(code, saved.codeVerifier ?? undefined);
    await saveProfiles(userId, profiles);
    const names = profiles.map((p) => `${p.name} (${PLATFORM_INFO[p.platform].name})`).join(", ");
    return back({ connected: names });
  } catch (e) {
    console.error(`[connect:${platform}]`, e);
    return back({ error: e instanceof Error ? e.message : "Connection failed" });
  }
}
