import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

export default nextConfig;

// Gives `next dev` local versions of the D1 database and R2 bucket from wrangler.jsonc.
initOpenNextCloudflareForDev();
