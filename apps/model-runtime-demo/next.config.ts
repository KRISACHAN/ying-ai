import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ying-ai/ai-core"],
  serverExternalPackages: [
    "@ying-ai/story-postgres",
    "@ying-ai/tool-web-search",
    "@ying-ai/tool-web-search-tavily",
    "@ying-ai/memory-postgres",
  ],
};

export default nextConfig;
