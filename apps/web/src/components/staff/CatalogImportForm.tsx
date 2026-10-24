"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATALOG_IMPORT_LIMITS, type CatalogImportMode } from "@kemdia/contracts/constants";
import type { CatalogImportReport } from "@kemdia/contracts";
import { FormAlert } from "@/components/ui/Field";

type Reply =
  | { ok: true; report: CatalogImportReport }
  | { ok: false; message: string; signedOut?: boolean; confirm?: boolean };

/**
 * Import du catalogue (S8-T03) : choisir le fichier, le vérifier, puis l'importer. « Importer » ne s'ouvre qu'après
 * une vérification sans erreur du même fichier ; l'API revérifie de toute façon tout le fichier.
 */
export function CatalogImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<CatalogImportMode | null>(null);
  const [report, setReport] = useState<CatalogImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(mode: CatalogImportMode) {
    if (!file) return;
    if (file.size > CATALOG_IMPORT_LIMITS.maxBytes) {
      setError("Fichier trop gros : 2 Mo au plus (découpez-le).");
      return;
    }
    setBusy(mode);
    setError(null);
    try {
      const response = await fetch(`/equipe/import/fichier?mode=${mode}`, {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: file,
      });
      const reply = (await response.json().catch(() => null)) as Reply | null;
      if (!reply) setError("Service momentanément indisponible. Réessayez dans quelques instants.");
      else if (reply.ok) setReport(reply.report);
      else if (reply.signedOut) router.push("/connexion?retour=%2Fequipe%2Fimport");
      else if (reply.confirm) router.push("/equipe/confirmer?retour=%2Fequipe%2Fimport");
      else setError(reply.message);
    } catch {
      setError("Service momentanément indisponible. Réessayez dans quelques instants.");
    } finally {
      setBusy(null);
    }
  }

  const canImport = report?.mode === "check" && report.valid && report.products > 0;

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl bg-white p-5">
        <label htmlFor="catalogue" className="block text-sm font-semibold">
          Fichier CSV du catalogue
        </label>
        <input
          id="catalogue"
          type="file"
          accept=".csv,text/csv"
          className="block text-sm"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setReport(null);
            setError(null);
          }}
        />
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!file || busy !== null}
            onClick={() => void send("check")}
            className="bg-brand-600 hover:bg-brand-700 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === "check" ? "Vérification…" : "Vérifier le fichier"}
          </button>
          <button
            type="button"
            disabled={!canImport || busy !== null}
            onClick={() => void send("import")}
            className="border-ink-300 hover:bg-ink-50 rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy === "import" ? "Import en cours…" : "Importer"}
          </button>
        </div>
        <p className="text-ink-500 text-xs">
          Rien n&apos;est écrit pendant la vérification. L&apos;import écrit tout le fichier, ou
          rien s&apos;il reste une erreur.
        </p>
      </div>

      {error && <FormAlert>{error}</FormAlert>}

      {report && (
        <section aria-live="polite" className="space-y-3 rounded-xl bg-white p-5 text-sm">
          {report.valid ? (
            <FormAlert tone="info">
              {report.mode === "import"
                ? `${report.created} produit(s) importé(s) : ils attendent la modération (photos à ajouter par chaque boutique).`
                : report.products > 0
                  ? `Fichier valable : ${report.products} produit(s) et ${report.variants} variante(s) à importer.`
                  : "Fichier valable, mais rien de nouveau à importer."}
              {report.alreadyImported > 0 &&
                ` ${report.alreadyImported} produit(s) déjà importé(s) : ignoré(s).`}
            </FormAlert>
          ) : (
            <FormAlert>
              {report.issueCount} erreur(s) : corrigez le fichier puis vérifiez-le de nouveau. Rien
              n&apos;a été importé.
            </FormAlert>
          )}
          {report.shops.length > 0 && (
            <ul className="list-disc pl-5">
              {report.shops.map((s) => (
                <li key={s.slug}>
                  {s.name} (<code>{s.slug}</code>) : {s.products} produit(s)
                </li>
              ))}
            </ul>
          )}
          {report.issues.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Erreurs du fichier</caption>
                <thead>
                  <tr className="border-ink-200 border-b">
                    <th scope="col" className="py-2 pr-3">
                      Ligne
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Colonne
                    </th>
                    <th scope="col" className="py-2">
                      Problème
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.issues.map((issue, i) => (
                    <tr key={i} className="border-ink-100 border-b align-top">
                      <td className="py-2 pr-3">{issue.line || "—"}</td>
                      <td className="py-2 pr-3">{issue.column ?? "—"}</td>
                      <td className="py-2">{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.issueCount > report.issues.length && (
                <p className="text-ink-500 mt-2">
                  … et {report.issueCount - report.issues.length} autre(s) erreur(s).
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
