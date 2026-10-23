"use client";

import { MessageSquareWarning } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Bouton « Signaler un problème » (S8-T02) : emporte la page en cours (chemin seulement, jamais les paramètres de
 * l'adresse, qui peuvent contenir un jeton).
 */
export function ReportProblemLink({ className }: { className?: string }) {
  const pathname = usePathname();
  const from =
    pathname && pathname !== "/signaler-un-probleme"
      ? `?depuis=${encodeURIComponent(pathname)}`
      : "";
  return (
    <Link href={`/signaler-un-probleme${from}`} className={className} prefetch={false}>
      <MessageSquareWarning aria-hidden className="size-4" />
      Signaler un problème
    </Link>
  );
}
