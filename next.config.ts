import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Content Security Policy. Everything (scripts, fonts, images, the QR decoder) is served from this origin; PSGC data is
// fetched on the server. 'unsafe-inline' for scripts is required by Next.js's inline bootstrap without per-request nonces
// (which would force every page, including the static landing page, to render dynamically); all other sources are locked.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera only for this site (QR check-in); everything else off.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const FILE_ROUTES = ["/fees/expenses/:id/receipt", "/fees/proof/:id", "/documents/:id/download", "/users/:id/photo", "/event-images/:id"];
const fileHeaders = [
  ...securityHeaders.filter((h) => h.key !== "Content-Security-Policy"),
  { key: "Content-Security-Policy", value: "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [
      // Every page and API route gets the site policy...
      { source: "/((?!fees/expenses/[^/]+/receipt|fees/proof/|documents/[^/]+/download|users/[^/]+/photo|event-images/).*)", headers: securityHeaders },
      // ...except user-uploaded files, which get a sandbox policy instead: even a crafted file can never run script here.
      ...FILE_ROUTES.map((source) => ({ source, headers: fileHeaders })),
      // Signed-in data must never be stored by shared caches or the browser's back/forward cache on a shared PC.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
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
