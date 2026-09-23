import { execFileSync } from "node:child_process";

import type { NextConfig } from "next";
const buildId =
  process.env.FUNES_BUILD_SHA ||
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const nextConfig: NextConfig = {
  // Repository guidance lives at the monorepo root.
  agentRules: false,
  output: "standalone",
  transpilePackages: ["@funes-vault/shared"],
  typedRoutes: true,
  generateBuildId: () => buildId,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" }
        ]
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }]
      }
    ];
  }
};
export default nextConfig;
