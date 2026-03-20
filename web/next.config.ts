import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    // Pin workspace root to web/ so Turbopack resolves node_modules
    // from here instead of the parent morality.network-master/ dir.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
