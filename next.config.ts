import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Vercel runs native Next.js; Sites continues to use vite.config.ts.
  webpack(config,{webpack}) {
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /^@\/lib\/track-api$/,
      path.resolve('lib/platform/vercel-api.ts'),
    ));
    return config;
  },
};

export default nextConfig;
