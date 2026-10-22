import { DEVICE_ALERT_DAYS, DEVICE_ALERT_TOKEN_PATTERN } from "@kemdia/contracts/constants";
import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { FormAlert } from "@/components/ui/Field";
import { deviceNotMeAction } from "@/lib/auth/actions";
import { authErrorMessage } from "@/lib/auth/messages";
import type { AuthErrorCode } from "@/lib/auth/types";

// Le jeton est dans l'adresse : jamais indexée, jamais transmise à un autre site
export const metadata: Metadata = {
  title: "Ce n'est pas moi",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
/** Codes que l'action renvoie ici (liste fermée : jamais un texte venu de l'adresse). */
const ERRORS: readonly AuthErrorCode[] = ["ALERTE_INVALIDE", "TROP_DE_REQUETES", "INDISPONIBLE"];

const LINK = "text-brand-700 font-semibold underline";

/**
 * Lien « ce n'est pas moi » de l'avis de nouvel appareil (S7.5-T04, ADR-0051). Ouvrir la page ne fait RIEN : seul le
 * bouton ferme les sessions (une messagerie qui ouvre les liens pour les « prévisualiser » ne déclenche donc rien).
 */
export default async function DeviceNotMePage({ searchParams }: Props) {
  const params = await searchParams;
  const error = ERRORS.find((code) => code === first(params.erreur));
  const raw = first(params.jeton);
  const token = raw && DEVICE_ALERT_TOKEN_PATTERN.test(raw) ? raw : null;

  if (first(params.fait) === "1") {
    return (
      <AuthShell title="Toutes vos sessions sont fermées">
        <div className="space-y-4">
          <FormAlert tone="info">
            Plus personne n&apos;est connecté à votre compte, sur aucun appareil (celui-ci compris),
            et votre ancien mot de passe ne fonctionne plus.
          </FormAlert>
          <p>
            Choisissez maintenant un <strong>nouveau mot de passe</strong> avec « Mot de passe
            oublié » : un code vous sera envoyé.
          </p>
          <Link
            href="/mot-de-passe-oublie"
            className="bg-brand-600 inline-flex rounded-full px-6 py-3 font-semibold text-white hover:opacity-90"
          >
            Changer mon mot de passe
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Une connexion que vous ne reconnaissez pas ?">
      <div className="space-y-4">
        {error && <FormAlert>{authErrorMessage({ code: error })}</FormAlert>}
        {token ? (
          <>
            <p>
              Ce bouton ferme <strong>toutes</strong> les sessions ouvertes sur votre compte, sur
              tous les appareils, et <strong>bloque votre mot de passe</strong>. Vous en choisirez
              ensuite un nouveau avec « Mot de passe oublié ».
            </p>
            <form action={deviceNotMeAction}>
              <input type="hidden" name="jeton" value={token} />
              <button
                type="submit"
                className="bg-brand-600 flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 font-semibold text-white hover:opacity-90"
              >
                <ShieldAlert className="size-5" aria-hidden /> Ce n&apos;est pas moi : tout
                déconnecter
              </button>
            </form>
            <p className="text-ink-500 text-sm">
              Si c&apos;était bien vous, fermez simplement cette page : rien n&apos;a été changé.
            </p>
          </>
        ) : (
          !error && (
            <p>
              Ce lien est incomplet. Ouvrez de nouveau le lien de l&apos;e-mail reçu (valable{" "}
              {DEVICE_ALERT_DAYS} jours), ou{" "}
              <Link href="/mot-de-passe-oublie" className={LINK}>
                changez votre mot de passe
              </Link>{" "}
              par prudence.
            </p>
          )
        )}
      </div>
    </AuthShell>
  );
}
