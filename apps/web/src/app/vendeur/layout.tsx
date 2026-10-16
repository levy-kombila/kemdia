import type { Metadata } from "next";

/**
 * Espace vendeur (S6-T06, ADR-0037) : demande de boutique, produits et photos. Jamais indexé ; chaque page vérifie
 * elle-même l'accès (`lib/vendor/vendor.ts`) et l'API reste juge de chaque lecture et de chaque modification.
 */
export const metadata: Metadata = {
  title: { template: "%s · Espace vendeur Kemdia", default: "Espace vendeur Kemdia" },
  robots: { index: false, follow: false },
};

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
