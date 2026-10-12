// Generates AUTH_SECRET, ENCRYPTION_KEY and CRON_SECRET and stores them as Worker secrets on Cloudflare.
// Run once, after `npx wrangler login`:  npm run setup:secrets
// Don't run it again later: a new ENCRYPTION_KEY makes saved social connections unreadable,
// and a new AUTH_SECRET signs everyone out.
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const secrets = {
  AUTH_SECRET: randomBytes(32).toString("base64"),
  ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  CRON_SECRET: randomBytes(16).toString("hex"),
};

const dir = mkdtempSync(join(tmpdir(), "postpilot-"));
const file = join(dir, "secrets.json");
try {
  writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
  execSync(`npx wrangler secret bulk "${file}"`, { stdio: "inherit" });
  console.log("\nSaved AUTH_SECRET, ENCRYPTION_KEY and CRON_SECRET to your Worker.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
