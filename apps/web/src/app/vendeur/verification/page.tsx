import { KYC_LIMITS } from "@kemdia/contracts/constants";
import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { Field, FormAlert, SelectField } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { KycPhotoUpload } from "@/components/vendor/KycPhotoUpload";
import { VendorShell } from "@/components/vendor/VendorShell";
import { formatDateTime } from "@/lib/format";
import { first } from "@/lib/search-params";
import { saveKycAction, submitKycAction } from "@/lib/vendor/actions";
import {
  DOCUMENT_LABEL,
  ID_TYPE_LABEL,
  KYC_FIELD_LABEL,
  KYC_STATUS,
  PAYOUT_LABEL,
} from "@/lib/vendor/labels";
import { vendorErrorFromParam, vendorErrorMessage, vendorNotice } from "@/lib/vendor/messages";
import { requireActiveVendor, vendorApi } from "@/lib/vendor/vendor";

export const metadata: Metadata = { title: "Vérification de la boutique" };

const primaryButton =
  "bg-brand-600 hover:bg-brand-700 rounded-full px-5 py-2.5 font-semibold text-white disabled:bg-ink-200 disabled:text-ink-500";

/**
 * Vérification du vendeur, KYC (S6-T08, ADR-0039 ; BR-024) : identité, RCCM pour une entreprise, compte de versement,
 * photos. Formulaire HTML simple ; les photos sont réduites dans le navigateur. Le vendeur ne revoit jamais ses
 * numéros complets ni ses photos (chiffrés) : seulement les 4 derniers caractères et la liste des photos reçues.
 */
export default async function VendorKycPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { token } = await requireActiveVendor("/vendeur/verification");
  const result = await vendorApi().kyc(token);
  const file = result.ok ? result.data : null;
  const blocking = !result.ok && result.code !== "KYC_INTROUVABLE" ? result.code : null;
  const fieldKey = first(params.champ);
  const fieldLabel =
    fieldKey && Object.hasOwn(KYC_FIELD_LABEL, fieldKey) ? KYC_FIELD_LABEL[fieldKey] : null;
  const error = vendorErrorFromParam(first(params.erreur));
  const editable = !blocking && (!file || file.canEdit);
  const kinds = file ? [...file.documents.map((d) => d.kind), ...file.missingDocuments] : [];

  return (
    <VendorShell
      section="verification"
      menu
      title="Vérification de la boutique"
      crumbs={[{ label: "Vérification" }]}
      notice={vendorNotice(first(params.ok))}
      error={error && fieldLabel ? `${error} Vérifiez ${fieldLabel}.` : error}
    >
      <section aria-label="État de la vérification" className="space-y-2 rounded-xl bg-white p-5">
        {file ? (
          <StatusBadge tone={KYC_STATUS[file.status].tone}>
            {KYC_STATUS[file.status].label}
          </StatusBadge>
        ) : (
          <StatusBadge tone="wait">Pas encore commencée</StatusBadge>
        )}
        <p className="text-ink-700 text-sm">
          Kemdia vérifie l&apos;identité de chaque vendeur et son compte de versement. Vous pouvez
          vendre dès maintenant, mais <strong>aucun versement</strong> ne vous sera fait tant que
          votre boutique n&apos;est pas vérifiée.
        </p>
        <p className="text-ink-500 flex items-start gap-2 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Numéros et photos sont chiffrés : seule l&apos;équipe Kemdia peut les voir, et les photos
          sont effacées 30 jours après sa décision.
        </p>
        {file?.status === "rejected" && file.rejectionReason && (
          <FormAlert>Motif du refus : {file.rejectionReason}</FormAlert>
        )}
        {file?.status === "pending" && file.submittedAt && (
          <p className="text-sm">
            Dossier envoyé le {formatDateTime(file.submittedAt)}. L&apos;équipe vous répond ici.
          </p>
        )}
        {file?.status === "approved" && (
          <p className="text-sm">
            Versements sur : {PAYOUT_LABEL[file.payoutMethod]} se terminant par{" "}
            <strong>{file.payoutAccountEnd}</strong>. Pour le changer, contactez le service client.
          </p>
        )}
      </section>

      {blocking && <FormAlert>{vendorErrorMessage(blocking)}</FormAlert>}

      {editable && (
        <form action={saveKycAction} className="space-y-4 rounded-xl bg-white p-5">
          <h2 className="font-bold">1. Votre identité</h2>
          <SelectField
            label="Vous vendez en tant que"
            name="holderKind"
            defaultValue={file?.holderKind ?? "individual"}
            required
          >
            <option value="individual">Personne seule</option>
            <option value="company">Entreprise (avec RCCM)</option>
          </SelectField>
          <Field
            label="Nom tel qu'il est écrit sur la pièce"
            name="legalName"
            defaultValue={file?.legalName ?? ""}
            required
            minLength={KYC_LIMITS.nameMin}
            maxLength={KYC_LIMITS.nameMax}
            autoComplete="name"
          />
          <SelectField
            label="Pièce d'identité"
            name="idType"
            defaultValue={file?.idType ?? "cni"}
            required
          >
            {Object.entries(ID_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <Field
            label="Numéro de la pièce"
            name="idNumber"
            required
            minLength={KYC_LIMITS.idNumberMin}
            maxLength={KYC_LIMITS.idNumberMax * 2}
            autoComplete="off"
            hint={
              file
                ? `Retapez-le à chaque modification (enregistré : se termine par ${file.idNumberEnd}).`
                : "Lettres et chiffres, sans espaces."
            }
          />
          <Field
            label="Numéro RCCM (entreprise seulement)"
            name="rccmNumber"
            defaultValue={file?.rccmNumber ?? ""}
            maxLength={KYC_LIMITS.rccmMax}
            hint="Laissez vide si vous vendez en tant que personne seule."
          />
          <h2 className="pt-2 font-bold">2. Votre compte de versement</h2>
          <SelectField
            label="Recevoir l'argent des ventes sur"
            name="payoutMethod"
            defaultValue={file?.payoutMethod ?? "airtel"}
            required
          >
            {Object.entries(PAYOUT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <Field
            label="Numéro du compte"
            name="payoutAccount"
            required
            maxLength={KYC_LIMITS.bankAccountMax * 2}
            autoComplete="off"
            inputMode="text"
            hint={
              file
                ? `Retapez-le à chaque modification (enregistré : se termine par ${file.payoutAccountEnd}).`
                : "Airtel Money : 07… ; Moov Money : 06… ; banque : RIB ou IBAN."
            }
          />
          <Field
            label="Titulaire du compte"
            name="payoutHolder"
            defaultValue={file?.payoutHolder ?? ""}
            required
            minLength={KYC_LIMITS.nameMin}
            maxLength={KYC_LIMITS.nameMax}
          />
          <button type="submit" className={primaryButton}>
            {file ? "Enregistrer les modifications" : "Enregistrer le dossier"}
          </button>
        </form>
      )}

      {file && editable && (
        <section aria-labelledby="photos" className="space-y-3 rounded-xl bg-white p-5">
          <h2 id="photos" className="font-bold">
            3. Photos
          </h2>
          <p className="text-ink-700 text-sm">
            Photo nette, entière et lisible, sans reflet. Elle est réduite sur votre téléphone avant
            l&apos;envoi.
          </p>
          {kinds.map((kind) => (
            <KycPhotoUpload
              key={kind}
              kind={kind}
              label={DOCUMENT_LABEL[kind]}
              received={file.documents.some((d) => d.kind === kind)}
            />
          ))}
        </section>
      )}

      {file && editable && (
        <section aria-labelledby="envoi" className="space-y-2 rounded-xl bg-white p-5">
          <h2 id="envoi" className="font-bold">
            4. Envoi
          </h2>
          {file.missingDocuments.length > 0 ? (
            <p className="text-ink-700 text-sm">
              Il manque encore :{" "}
              {file.missingDocuments.map((kind) => DOCUMENT_LABEL[kind]).join(", ")}.
            </p>
          ) : (
            <p className="text-ink-700 text-sm">
              Tout est prêt. Après l&apos;envoi, le dossier ne peut plus être modifié pendant sa
              vérification.
            </p>
          )}
          <form action={submitKycAction}>
            <button
              type="submit"
              className={primaryButton}
              disabled={file.missingDocuments.length > 0}
            >
              Envoyer à l&apos;équipe Kemdia
            </button>
          </form>
        </section>
      )}
    </VendorShell>
  );
}
