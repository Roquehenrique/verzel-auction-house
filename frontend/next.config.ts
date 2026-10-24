import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Playwright suite builds into its own folder (see playwright.config.ts)
  // so it never overwrites the regular build.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
