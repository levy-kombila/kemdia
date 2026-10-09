"use client";

import { useEffect, useState } from "react";

/** Délai avant d'afficher le message : quand l'API répond normalement, le visiteur ne voit rien. */
export const WAKE_NOTICE_DELAY_MS = 2_000;

/**
 * Attente d'une page sur la DÉMO (S4-T08) : le layout l'envoie tout de suite (`<Suspense>`), avant que la page ait
 * ses données. Jamais ailleurs : en streaming, les vrais codes 404, 500 et 307 seraient perdus.
 * - les 2 premières secondes : zone vide (pas de clignotement quand l'API répond vite) ;
 * - ensuite, sur la démo gratuite : « La boutique se réveille… » (l'API dort après 15 min sans visite) ;
 *   ailleurs : « Chargement… ».
 * La page remplace ce bloc d'elle-même dès que l'API répond : rien à recharger.
 */
export function WakeUpNotice({ demo }: { demo: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), WAKE_NOTICE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    // Hauteur réservée : le pied de page reste sous l'écran, rien ne saute à l'arrivée du contenu
    <div className="container-page flex min-h-[70vh] items-center justify-center py-16">
      <div role="status" aria-live="polite" className="max-w-md text-center">
        {visible &&
          (demo ? (
            <>
              <span
                className="border-brand-100 border-t-brand-600 mx-auto block size-12 animate-spin rounded-full border-4 motion-reduce:animate-none"
                aria-hidden
              />
              <p className="mt-5 text-xl font-extrabold">La boutique se réveille…</p>
              <p className="text-ink-500 mt-2 text-sm">
                Cette démonstration gratuite s&apos;endort après 15 minutes sans visite. Le premier
                affichage peut prendre jusqu&apos;à une minute ; la page s&apos;affichera toute
                seule.
              </p>
            </>
          ) : (
            <p className="text-ink-500 text-sm">Chargement…</p>
          ))}
      </div>
    </div>
  );
}
