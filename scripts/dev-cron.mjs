// Local stand-in for the Cloudflare Cron Trigger: calls the publish route every 30 seconds.
// Run next to `npm run dev`:  npm run cron:local
import { readFileSync, existsSync } from "node:fs";

const vars = {};
for (const file of [".dev.vars", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && vars[m[1]] === undefined) vars[m[1]] = m[2];
  }
}
const base = process.env.LOCAL_URL || "http://localhost:3000";
const secret = vars.CRON_SECRET;
if (!secret) {
  console.error("Set CRON_SECRET in .dev.vars first.");
  process.exit(1);
}

async function tick() {
  try {
    const res = await fetch(`${base}/api/cron/publish`, { headers: { authorization: `Bearer ${secret}` } });
    const body = await res.json();
    for (const p of body.published ?? []) console.log(`[cron] post ${p.id} → ${p.status}`);
    if (!res.ok) console.error("[cron]", res.status, body);
  } catch (e) {
    console.error("[cron] couldn't reach the app:", e.message);
  }
}

console.log(`[cron] calling ${base}/api/cron/publish every 30s`);
tick();
setInterval(tick, 30_000);
