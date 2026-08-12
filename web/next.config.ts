import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin workspace root to the repo checkout so Turbopack can compile
    // ../packages/wallet (aliased as @pooter/wallet in tsconfig paths).
    // Dependency resolution for that package goes through the committed
    // packages/wallet/node_modules -> ../../web/node_modules symlink, so
    // everything still resolves from web/node_modules.
    root: path.resolve(__dirname, ".."),
  },
};

export default nextConfig;
