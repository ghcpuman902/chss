import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Partial Prerendering + `use cache` (replaces experimental.ppr / unstable_cache)
  cacheComponents: true,
  experimental: {
    // Tree-shake lucide / radix barrels → smaller client JS (LCP / INP)
    optimizePackageImports: ["lucide-react", "radix-ui"],
  },
  turbopack: {
    // Keep resolution rooted at this app (not the parent monorepo folder)
    root: path.join(__dirname),
  },
};

export default nextConfig;
