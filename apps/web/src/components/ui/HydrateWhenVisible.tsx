"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isFirstHydrationDone } from "@/lib/hydration";

/**
 * Hydratation à la demande (S3-T08) : le HTML envoyé par le serveur est affiché tout de suite et reste
 * dans la page (référencement, lecture sans JavaScript), mais React ne le rend interactif qu'à l'approche
 * de l'écran. L'accueil compte ~50 cartes produits sous la ligne de flottaison : les rendre toutes
 * interactives au chargement bloquait le téléphone plusieurs centaines de millisecondes.
 *
 * Fonctionnement :
 * - au serveur, les enfants sont rendus normalement dans une `<div>` ;
 * - à l'hydratation, React reçoit une `<div>` au contenu « réservé » (`dangerouslySetInnerHTML` vide +
 *   `suppressHydrationWarning`) : il garde le HTML du serveur tel quel, sans le parcourir ;
 * - quand la zone approche de l'écran (ou au premier geste au clavier), les enfants sont rendus par React
 *   et deviennent interactifs. Le contenu affiché est identique.
 *
 * Focus clavier (S8-T04) : React remplace alors le HTML du serveur par de nouveaux éléments ; celui qui venait de
 * recevoir le focus (lien du pied de page atteint avec Tab) disparaît. Sa place parmi les éléments focusables de la
 * zone est retenue, et le focus lui est rendu juste après le rendu.
 */
const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])";

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

export function HydrateWhenVisible({
  children,
  rootMargin = "400px",
}: {
  children: React.ReactNode;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Serveur : contenu rendu. Navigateur : en attente seulement pendant la PREMIÈRE hydratation de la page
  // (une navigation côté client n'a pas de HTML serveur à conserver : elle rend tout directement).
  const [active, setActive] = useState(
    () => typeof window === "undefined" || isFirstHydrationDone(),
  );
  /** Place de l'élément qui avait le focus au moment du rendu interactif (-1 : aucun) */
  const focusIndex = useRef(-1);

  // Juste après le rendu, avant l'affichage : rendre le focus à l'élément équivalent
  useLayoutEffect(() => {
    if (!active || focusIndex.current < 0 || !ref.current) return;
    focusables(ref.current)[focusIndex.current]?.focus();
    focusIndex.current = -1;
  }, [active]);

  useEffect(() => {
    if (active) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          // Le focus peut déjà être dans la zone (Tab avant l'arrivée à l'écran)
          const focused = document.activeElement;
          if (focused instanceof HTMLElement && el.contains(focused))
            focusIndex.current = focusables(el).indexOf(focused);
          setActive(true);
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    // Navigation au clavier : rendre la zone interactive dès qu'elle reçoit le focus, sans le perdre
    const onFocus = (e: FocusEvent) => {
      focusIndex.current = e.target instanceof HTMLElement ? focusables(el).indexOf(e.target) : -1;
      setActive(true);
    };
    el.addEventListener("focusin", onFocus);
    return () => {
      observer.disconnect();
      el.removeEventListener("focusin", onFocus);
    };
  }, [active, rootMargin]);

  if (active) return <div ref={ref}>{children}</div>;
  return <div ref={ref} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: "" }} />;
}
