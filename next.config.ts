import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Next's own inline bootstrap scripts need 'unsafe-inline' without per-request nonces; everything else is
// locked to this site. The Print Agent runs on the counter PC itself (http://127.0.0.1:9311 by default).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' http://127.0.0.1:* http://localhost:*" + (isDev ? " ws: wss:" : ""),
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // no upgrade-insecure-requests: it would send the Print Agent's http://127.0.0.1 calls to https
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // the camera is used for QR scanning on this site only
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]),
];

const nextConfig: NextConfig = {
  /* config options here */
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
