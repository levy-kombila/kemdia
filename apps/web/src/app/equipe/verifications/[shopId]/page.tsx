import { SHOP_LIMITS } from "@kemdia/contracts/constants";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApproveForm, ReasonForm } from "@/components/staff/DecisionForms";
import { StaffShell, StatusBadge } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatGabonPhone } from "@/lib/auth/validation";
import { formatDateTime } from "@/lib/format";
import { first } from "@/lib/search-params";
import { decideKycAction } from "@/lib/staff/actions";
import { KYC_STATUS } from "@/lib/staff/labels";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "@/lib/staff/messages";
import { requireVerifiedStaff, staffApi } from "@/lib/staff/staff";
import { DOCUMENT_LABEL, ID_TYPE_LABEL, PAYOUT_LABEL } from "@/lib/vendor/labels";

export const metadata: Metadata = { title: "Dossier de vérification" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[12rem_1fr]">
      <dt className="text-ink-500 text-sm font-semibold">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/**
 * Dossier de vérification d'un vendeur (S6-T08, ADR-0039 ; BR-024), administrateurs seulement. Numéros complets et
 * photos déchiffrés par l'API : chaque ouverture du dossier et chaque photo sont inscrites au journal d'audit. Valider
 * ou refuser (motif montré au vendeur) un dossier en attente.
 */
export default async function KycFilePage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ shopId }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(shopId)) notFound();
  const { account, token } = await requireVerifiedStaff(
    `/equipe/verifications/${shopId}`,
    "catalog",
  );
  const result = await staffApi().kyc(token, shopId);
  if (!result.ok && result.code === "KYC_INTROUVABLE") notFound();
  const crumbs = [{ label: "Vérifications", href: "/equipe/verifications" }, { label: "Dossier" }];
  if (!result.ok) {
    return (
      <StaffShell section="verifications" roles={account.roles} title="Dossier" crumbs={crumbs}>
        <FormAlert>{staffErrorMessage(result.code)}</FormAlert>
      </StaffShell>
    );
  }

  const file = result.data;
  const state = KYC_STATUS[file.status];
  const hidden = { shopId: file.shopId };
  const payout =
    file.payoutMethod === "bank" ? file.payoutAccount : formatGabonPhone(file.payoutAccount);

  return (
    <StaffShell
      section="verifications"
      roles={account.roles}
      title={file.shopName}
      crumbs={crumbs}
      notice={staffNotice(first(query.ok))}
      error={staffErrorFromParam(first(query.erreur))}
    >
      <p className="text-ink-500 text-sm">
        Données confidentielles : cette consultation est inscrite au journal d&apos;audit. Ne les
        recopiez nulle part.
      </p>
      <section aria-label="Dossier" className="rounded-xl bg-white p-6">
        <dl className="divide-ink-100 divide-y">
          <Row label="Statut">
            <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
          </Row>
          <Row label="Vend en tant que">
            {file.holderKind === "company" ? "Entreprise" : "Personne seule"}
          </Row>
          <Row label="Nom sur la pièce">{file.legalName}</Row>
          <Row label="Pièce">
            {ID_TYPE_LABEL[file.idType]} n° <strong>{file.idNumber}</strong>
          </Row>
          {file.rccmNumber && <Row label="RCCM">{file.rccmNumber}</Row>}
          <Row label="Versements">
            {PAYOUT_LABEL[file.payoutMethod]} : <strong>{payout}</strong>
            <span className="text-ink-500 block text-sm">Titulaire : {file.payoutHolder}</span>
          </Row>
          {file.submittedAt && <Row label="Envoyé le">{formatDateTime(file.submittedAt)}</Row>}
          {file.reviewedAt && <Row label="Décision le">{formatDateTime(file.reviewedAt)}</Row>}
          {file.rejectionReason && <Row label="Motif donné">{file.rejectionReason}</Row>}
          {file.documentsPurgeAt && (
            <Row label="Photos effacées le">{formatDateTime(file.documentsPurgeAt)}</Row>
          )}
        </dl>
      </section>

      <section aria-labelledby="photos" className="space-y-4 rounded-xl bg-white p-6">
        <h2 id="photos" className="font-bold">
          Photos
        </h2>
        {file.documents.length === 0 ? (
          <p className="text-ink-500 text-sm">Aucune photo (effacées après la décision).</p>
        ) : (
          file.documents.map((doc) => (
            <figure key={doc.kind} className="space-y-1">
              {/* Relais du site, jamais l'optimiseur ni un cache (photo chiffrée côté API) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/equipe/verifications/${file.shopId}/documents/${doc.kind}`}
                alt={`${DOCUMENT_LABEL[doc.kind]} de ${file.legalName}`}
                className="border-ink-100 max-h-[70vh] w-full rounded-lg border object-contain"
              />
              <figcaption className="text-ink-500 text-sm">
                {DOCUMENT_LABEL[doc.kind]} · reçue le {formatDateTime(doc.uploadedAt)}
              </figcaption>
            </figure>
          ))
        )}
      </section>

      {file.status === "pending" && (
        <section aria-label="Décision" className="space-y-3">
          <p className="text-ink-700 text-sm">
            Vérifiez que le nom et le numéro correspondent à la pièce, et que le titulaire du compte
            est bien le vendeur (ou son entreprise).
          </p>
          <ApproveForm action={decideKycAction} hidden={hidden}>
            Valider le dossier
          </ApproveForm>
          <ReasonForm
            action={decideKycAction}
            hidden={hidden}
            decision="reject"
            label="Motif du refus (montré au vendeur)"
            button="Refuser le dossier"
            min={SHOP_LIMITS.reasonMin}
            max={SHOP_LIMITS.reasonMax}
          />
        </section>
      )}
    </StaffShell>
  );
}
