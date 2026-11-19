// ──────────────────────────────────────────────────────────────────────
// WHAT: Next.js settings for the whole app.
//   reactStrictMode  -> extra checks while developing (no effect on the live site's speed).
//   poweredByHeader  -> don't advertise "X-Powered-By: Next.js" to visitors.
//   headers()        -> security headers added to every response:
//     X-Frame-Options: DENY            the site can't be shown inside another site's frame (click-jacking)
//     X-Content-Type-Options: nosniff  browsers must trust the declared file type
//     Referrer-Policy                  other sites only see our domain, not full page addresses
//     Permissions-Policy               the site never asks for camera, microphone or location
// ──────────────────────────────────────────────────────────────────────

import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
