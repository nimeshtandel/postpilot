import { publishDuePosts } from "@/lib/publisher";
import { readVar } from "@/lib/env";

export const dynamic = "force-dynamic";

// Called every minute by the Cloudflare Cron Trigger (worker.ts), or locally by `npm run cron:local`,
// with  Authorization: Bearer <CRON_SECRET>
export async function GET(req: Request) {
  const secret = readVar("CRON_SECRET");
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const results = await publishDuePosts(3);
  return Response.json({ published: results });
}
