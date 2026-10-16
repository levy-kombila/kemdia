"use client";

import { Download } from "lucide-react";
import { useState } from "react";

/**
 * Codes de secours, montrés UNE seule fois (S6-T05). Le fichier proposé au téléchargement est fabriqué dans le
 * navigateur (rien ne repart vers le serveur) ; l'utilisateur doit confirmer les avoir rangés avant de continuer.
 */
export function RecoveryCodes({
  codes,
  next,
}: {
  codes: string[];
  next: { href: string; label: string };
}) {
  const [saved, setSaved] = useState(false);

  const download = () => {
    const text = [
      "Kemdia — codes de secours de la double authentification",
      "Chaque code ne sert qu'une fois. Rangez ce fichier hors de votre téléphone.",
      "",
      ...codes,
      "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "kemdia-codes-de-secours.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <p className="text-ink-700 text-sm">
        Si vous perdez votre téléphone, chacun de ces codes remplace <strong>une fois</strong> le
        code de l&apos;application. Notez-les ou téléchargez-les maintenant et rangez-les hors du
        téléphone : <strong>ils ne seront plus jamais affichés</strong>.
      </p>
      <ol
        aria-label="Codes de secours"
        className="bg-ink-50 grid grid-cols-1 gap-2 rounded-xl p-4 font-mono text-base sm:grid-cols-2"
      >
        {codes.map((code) => (
          <li key={code} className="select-all tracking-wider">
            {code}
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={download}
        className="border-ink-200 hover:bg-ink-50 flex items-center gap-2 rounded-full border-2 px-5 py-2.5 text-sm font-semibold"
      >
        <Download className="size-4" aria-hidden /> Télécharger les codes (.txt)
      </button>
      <label className="flex items-start gap-3 text-sm font-medium">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="accent-brand-600 mt-0.5 size-5"
        />
        J&apos;ai rangé mes codes de secours en lieu sûr.
      </label>
      {saved ? (
        <a
          href={next.href}
          className="bg-brand-600 hover:bg-brand-700 inline-flex rounded-full px-6 py-3 font-semibold text-white"
        >
          {next.label}
        </a>
      ) : (
        <span
          aria-disabled="true"
          className="bg-ink-200 text-ink-500 inline-flex cursor-not-allowed rounded-full px-6 py-3 font-semibold"
        >
          {next.label}
        </span>
      )}
    </div>
  );
}
