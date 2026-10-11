"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Relit la page toutes les `seconds` secondes (nouvelles demandes sur le téléphone simulé), onglet visible seulement. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
