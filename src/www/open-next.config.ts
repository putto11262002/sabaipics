import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
  ...defineCloudflareConfig({}),
  buildCommand: "cd ../.. && pnpm build:www",
};
