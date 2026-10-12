import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page in PostPilot is per-user and dynamic, so no incremental cache is needed.
export default defineCloudflareConfig({});
