import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // WhatsApp linked-device client: loaded from node_modules at runtime rather than bundled
  serverExternalPackages: ["baileys", "qrcode", "pino"],
  partialPrefetching: true,
  experimental: {
    // Every screen waits for its data (the signed-in user's state, or the public booking/kiosk data)
    // to load in the browser before rendering, so pages are never instant by design. Only validate
    // segments that explicitly opt in with `export const instant = true`.
    instantInsights: { validationLevel: "manual-warning" },
  },
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
