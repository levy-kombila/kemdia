import { FlaskConical } from "lucide-react";
import Link from "next/link";

/**
 * Bandeau « démonstration » (S5-T08, ADR-0030) : affiché seulement là où le bac à sable existe (poste de développement,
 * tests, démo Render), jamais en préproduction ni en production. Rendu par le serveur, hauteur fixe : rien ne saute.
 */
export function DemoBanner() {
  return (
    <div className="bg-ink-900 text-ink-50 flex h-8 items-center justify-center gap-2 px-4 text-xs">
      <FlaskConical className="text-accent-400 size-3.5 shrink-0" aria-hidden />
      <p className="truncate">
        Site de démonstration : aucun vrai paiement.{" "}
        <Link href="/demo" className="text-accent-300 font-semibold underline">
          Tester un achat
        </Link>
      </p>
    </div>
  );
}
