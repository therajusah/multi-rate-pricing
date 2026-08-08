import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the Docker/DigitalOcean image small; Vercel ignores it.
  output: "standalone",
  agentRules: false,
};

export default nextConfig;
