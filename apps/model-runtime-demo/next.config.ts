import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ying-companion/ai-core"],
  serverExternalPackages: [
    "@ying-companion/story-postgres",
    "@ying-companion/tool-web-search",
    "@ying-companion/tool-web-search-tavily",
    "@ying-companion/memory-postgres",
  ],
};

export default nextConfig;
