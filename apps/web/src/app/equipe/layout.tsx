import type { Metadata } from "next";

/**
 * Espace de l'équipe Kemdia (S6-T05, ADR-0036) : modérateurs et administrateurs. Jamais indexé ; chaque page vérifie
 * elle-même l'accès (`lib/staff/staff.ts`) et l'API reste juge de chaque lecture et de chaque décision.
 */
export const metadata: Metadata = {
  title: { template: "%s · Équipe Kemdia", default: "Équipe Kemdia" },
  robots: { index: false, follow: false },
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return children;
}
