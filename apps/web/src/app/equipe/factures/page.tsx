import { ADMIN_INVOICE_CURSOR_PATTERN } from "@kemdia/contracts";
import { FileDown, FileText, Mail, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StaffShell, StatusBadge } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatDateTime, formatFCFA } from "@/lib/format";
import { first } from "@/lib/search-params";
import { resendInvoiceAction } from "@/lib/staff/actions";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Factures" };

/** Numéro de facture, d'avoir ou de commande ; le reste est ignoré (l'API revérifie). */
const QUERY = /^(KMD-[FA]-\d{4}-\d{6}|KMD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6})$/;
const METHOD = { airtel: "Airtel Money", moov: "Moov Money", cod: "Espèces" } as const;
const EMAIL = {
  sent: { label: "E-mail envoyé", tone: "ok" },
  pending: { label: "Envoi en cours", tone: "wait" },
  failed: { label: "Non envoyée", tone: "bad" },
} as const;

/**
 * Factures et avoirs (S7.5-T05, ADR-0052), Finance : du plus récent au plus ancien, recherche par numéro de facture ou
 * de commande, PDF (téléchargement inscrit au journal) et renvoi au client.
 */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = (first(params.q) ?? "").trim().toUpperCase().slice(0, 30);
  const q = QUERY.test(raw) ? raw : undefined;
  const cursor = first(params.apres);
  const after = cursor && ADMIN_INVOICE_CURSOR_PATTERN.test(cursor) ? cursor : undefined;
  const { account, token } = await requireVerifiedStaff("/equipe/factures", "finance");
  const result = await staffApi().invoices(token, { q, after });

  return (
    <StaffShell
      section="factures"
      roles={account.roles}
      title="Factures"
      crumbs={[{ label: "Factures" }]}
      notice={staffNotice(first(params.ok))}
      error={staffErrorFromParam(first(params.erreur))}
    >
      <form className="flex flex-col gap-2 sm:flex-row" action="/equipe/factures">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Numéro de facture ou de commande</span>
          <input
            name="q"
            defaultValue={q ?? raw}
            maxLength={30}
            placeholder="KMD-F-2026-000001 ou KMD-7F3K9Q"
            className="border-ink-200 focus:border-brand-600 h-11 w-full rounded-xl border bg-white px-4 uppercase outline-none"
          />
        </label>
        <button
          type="submit"
          className="bg-ink-900 flex h-11 items-center justify-center gap-2 rounded-full px-5 font-semibold text-white"
        >
          <Search className="size-4" aria-hidden /> Rechercher
        </button>
      </form>
      {raw && !q && (
        <FormAlert>
          Saisissez un numéro de facture (KMD-F-…), d&apos;avoir (KMD-A-…) ou de commande (KMD-…).
        </FormAlert>
      )}

      {!result.ok ? (
        <FormAlert>{staffErrorMessage(result.code)}</FormAlert>
      ) : result.data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-6 py-12 text-center">
          <FileText className="text-ink-400 size-10" aria-hidden />
          <p className="font-semibold">
            {q ? "Aucune facture pour ce numéro." : "Aucune facture."}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {result.data.items.map((invoice) => (
              <li key={invoice.number} className="space-y-2 rounded-xl bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{invoice.number}</span>
                  {invoice.kind === "credit_note" && <StatusBadge tone="off">Avoir</StatusBadge>}
                  <StatusBadge tone={EMAIL[invoice.email].tone}>
                    {EMAIL[invoice.email].label}
                  </StatusBadge>
                </div>
                <p className="text-ink-500 text-sm">
                  {formatDateTime(invoice.issuedAt)} · commande {invoice.orderReference} ·{" "}
                  {invoice.buyerName} · {METHOD[invoice.paymentMethod]} ·{" "}
                  <strong className="text-ink-900">{formatFCFA(invoice.total)}</strong>
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/equipe/factures/${invoice.number}`}
                    className="border-ink-200 hover:bg-ink-50 inline-flex items-center gap-1 rounded-full border-2 px-3 py-1 text-sm font-semibold"
                  >
                    <FileDown className="size-4" aria-hidden /> PDF
                  </a>
                  {invoice.email !== "pending" && (
                    <form action={resendInvoiceAction}>
                      <input type="hidden" name="number" value={invoice.number} />
                      <button
                        type="submit"
                        className="border-ink-200 hover:bg-ink-50 inline-flex items-center gap-1 rounded-full border-2 px-3 py-1 text-sm font-semibold"
                      >
                        <Mail className="size-4" aria-hidden /> Renvoyer au client
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {result.data.nextCursor && (
            <Link
              href={`/equipe/factures?${q ? `q=${q}&` : ""}apres=${result.data.nextCursor}`}
              className="border-ink-200 hover:bg-ink-50 inline-flex rounded-full border-2 bg-white px-5 py-2.5 text-sm font-semibold"
            >
              Factures plus anciennes
            </Link>
          )}
        </>
      )}
    </StaffShell>
  );
}
