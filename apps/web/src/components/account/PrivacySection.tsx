import { Download } from "lucide-react";
import Link from "next/link";
import { DeleteAccountForm } from "@/components/account/DeleteAccountForm";
import { FormAlert } from "@/components/ui/Field";
import type { AccountDeletionStatus } from "@kemdia/contracts";
import { BLOCKER_LABELS } from "@/lib/privacy/messages";

/**
 * « Mes données » (S7-T08, loi n°001/2011 modifiée) : copie JSON et suppression du compte. `status` : réponse de l'API
 * (`null` si elle ne répond pas : la suppression n'est alors pas proposée).
 */
export function PrivacySection({ status }: { status: AccountDeletionStatus | null }) {
  return (
    <section aria-labelledby="mes-donnees" className="rounded-xl bg-white p-6 sm:p-8">
      <h2 id="mes-donnees" className="text-lg font-extrabold">
        Mes données
      </h2>
      <p className="text-ink-500 mt-1 text-sm">
        Ce que Kemdia garde sur vous et pourquoi :{" "}
        <Link href="/infos/confidentialite" className="text-brand-700 font-semibold underline">
          politique de confidentialité
        </Link>
        .
      </p>
      <a
        href="/compte/mes-donnees"
        download
        className="border-brand-600 text-brand-700 hover:bg-brand-50 mt-4 inline-flex items-center justify-center gap-2 rounded-full border-2 px-5 py-2.5 font-semibold"
      >
        <Download className="size-4" aria-hidden /> Télécharger mes données (JSON)
      </a>

      {status === null ? (
        <div className="mt-6">
          <FormAlert>
            La suppression du compte est momentanément indisponible. Réessayez plus tard.
          </FormAlert>
        </div>
      ) : status.possible ? (
        <DeleteAccountForm />
      ) : (
        <div className="mt-6 max-w-md space-y-2">
          <h3 className="font-bold">Supprimer mon compte</h3>
          <p className="text-ink-500 text-sm">
            La suppression n&apos;est pas possible pour le moment :
          </p>
          <ul className="text-ink-700 list-disc space-y-1 pl-5 text-sm">
            {status.reasons.map((reason) => (
              <li key={reason}>{BLOCKER_LABELS[reason] ?? reason}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
