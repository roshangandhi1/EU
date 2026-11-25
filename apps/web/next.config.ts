import type { NextConfig } from "next";

/**
 * Security headers on every response (SEC-13). No full content security policy: the maps load
 * tiles, styles and workers from several hosts. frame-ancestors alone stops clickjacking of the
 * admin forms (phone removal, user deactivation, password reset).
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Only this site may ask for location (maps); camera, microphone and payments are never needed.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@eu/core", "@eu/db", "@eu/sync", "@eu/forestry", "@eu/boreholes", "@eu/maps"],
  serverExternalPackages: ["ws", "@electric-sql/pglite"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
