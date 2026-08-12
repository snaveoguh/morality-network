import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin workspace root to web/ so Turbopack resolves node_modules
    // from here instead of the parent morality.network-master/ dir.
    // @pooter/wallet lives at web/packages/wallet (inside this root) so
    // web-rooted Railway builds see it too.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
