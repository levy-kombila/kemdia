"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

/**
 * Page d'erreur générique : aucun détail technique n'est montré à l'utilisateur
 * (l'ancien site exposait des traces en mode DEBUG). Le `digest` permet de retrouver l'erreur dans les logs serveur.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container-page flex flex-col items-center py-20 text-center">
      <TriangleAlert className="text-brand-600 size-14" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold">Une erreur est survenue</h1>
      <p className="text-ink-500 mt-2 max-w-md">Veuillez réessayer dans quelques instants.</p>
      {error.digest && <p className="text-ink-400 mt-1 text-xs">Référence : {error.digest}</p>}
      <button
        type="button"
        onClick={() => retry()}
        className="bg-brand-600 hover:bg-brand-700 mt-6 rounded-full px-6 py-3 font-semibold text-white"
      >
        Réessayer
      </button>
    </div>
  );
}
