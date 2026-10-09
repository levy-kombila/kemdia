import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * La Content-Security-Policy n'est plus ici : elle est posée par `src/proxy.ts`, avec un nonce neuf à chaque
 * requête (S4-T07, ADR-0021). Les autres en-têtes de sécurité restent identiques pour toutes les adresses.
 */
const securityHeaders = [
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
