"use client";

import { useRouter } from "next/navigation";

/**
 * Tri de la liste. Les paramètres courants (recherche, filtres) viennent du serveur en props :
 * le menu est donc rendu dès le HTML, sans attendre le JavaScript (pas de décalage de mise en page, S2-T08).
 */
export function SortSelect({
  value,
  options,
  basePath,
  params,
}: {
  value: string;
  options: Record<string, string>;
  basePath: string;
  /** Paramètres à conserver (q, filtres), sans tri ni page */
  params: Record<string, string>;
}) {
  const router = useRouter();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-500 sr-only sm:not-sr-only">Trier par</span>
      <select
        value={value}
        onChange={(e) => {
          const sp = new URLSearchParams(params);
          if (e.target.value !== "pertinence") sp.set("tri", e.target.value);
          const qs = sp.toString();
          router.push(qs ? `${basePath}?${qs}` : basePath);
        }}
        className="border-ink-200 focus:border-brand-500 h-10 rounded-full border bg-white px-3 font-medium focus:outline-none sm:px-4"
      >
        {Object.entries(options).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
