import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into ./drizzle, which Wrangler applies to D1:
//   npm run db:generate          (after editing src/lib/schema.ts)
//   npm run db:migrate:local     (local D1 used by `npm run dev`)
//   npm run db:migrate:remote    (your D1 database on Cloudflare)
export default defineConfig({
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
