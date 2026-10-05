import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy (corrige LOW-03 de l'audit : aucune CSP sur l'ancien site).
 * Tout est servi depuis notre propre domaine : plus de CDN tiers (Bootstrap, Font Awesome, AOS, Swiper…).
 * Étape suivante (Sprint 4) : CSP à nonce via proxy.ts quand l'API et le paiement seront branchés.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(self)",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev
    ? []
    : [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      ]),
];

const nextConfig: NextConfig = {
  output: "standalone", // image Docker minimale (voir Dockerfile)
  poweredByHeader: false, // ne pas annoncer la techno utilisée
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75],
    localPatterns: [{ pathname: "/images/**", search: "" }],
    minimumCacheTTL: 86400,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
