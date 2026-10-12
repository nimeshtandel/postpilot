import { lt } from "drizzle-orm";
import { db, oauthStates } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { pkceChallenge, randomToken } from "@/lib/crypto";
import { isPlatform } from "@/lib/platforms";
import { CONNECTORS, isConfigured } from "@/lib/social";

// GET /api/connect/:platform → redirect the user to the platform's consent screen.
export async function GET(_req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params;
  const userId = await getUserId();
  if (!userId) return Response.redirect(`${appUrl()}/login`, 303);

  if (!isPlatform(platform) || !CONNECTORS[platform])
    return Response.redirect(`${appUrl()}/accounts?error=${encodeURIComponent("Unknown platform")}`, 303);
  if (!isConfigured(platform)) {
    const keys = CONNECTORS[platform]!.requiredEnv.join(", ");
    return Response.redirect(`${appUrl()}/accounts?error=${encodeURIComponent(`Add ${keys} as Worker secrets to enable this platform`)}`, 303);
  }

  const connector = CONNECTORS[platform]!;
  const state = randomToken(24);
  const codeVerifier = connector.pkce ? randomToken(48) : undefined;

  // Clean up stale states (older than 15 min) while we're here.
  await db.delete(oauthStates).where(lt(oauthStates.createdAt, new Date(Date.now() - 15 * 60_000)));
  await db.insert(oauthStates).values({ state, userId, platform, codeVerifier });

  return Response.redirect(connector.authUrl(state, codeVerifier ? await pkceChallenge(codeVerifier) : undefined), 303);
}
