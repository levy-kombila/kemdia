import { Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/payments/AutoRefresh";
import { SandboxInbox } from "@/components/payments/SandboxInbox";
import { FormAlert } from "@/components/ui/Field";
import { sandboxApi, sandboxPageEnabled, sessionToken } from "@/lib/payments/sandbox";
import { sandboxMessage } from "@/lib/payments/sandbox-messages";

export const metadata: Metadata = {
  title: "Téléphone simulé",
  robots: { index: false, follow: false },
};

/**
 * Téléphone simulé du bac à sable Mobile Money (S5-T05, ADR-0027) : poste de développement et démo seulement.
 * Le client y voit les demandes de paiement de SON compte et les valide (code PIN fictif) ou les refuse ; l'opérateur
 * simulé prévient alors Kemdia par une notification signée, comme le vrai opérateur. Aucun argent ne circule.
 */
export default async function SandboxPhonePage() {
  if (!sandboxPageEnabled()) notFound();
  const token = await sessionToken();
  const result = token ? await sandboxApi().list(token) : null;
  if (result && !result.ok && result.code === "BAC_A_SABLE_FERME") notFound();
  const signedIn = result !== null && (result.ok || result.code !== "SESSION_INVALIDE");

  return (
    <div className="mx-auto max-w-sm px-4 py-8">
      <div className="bg-ink-900 rounded-[2.5rem] p-3 shadow-xl">
        <div className="bg-ink-50 min-h-[32rem] rounded-[2rem] p-5 text-center">
          <Smartphone className="text-brand-600 mx-auto size-8" aria-hidden />
          <h1 className="mt-2 text-xl font-extrabold">Téléphone simulé</h1>
          <p className="text-ink-500 mt-1 text-xs">
            Démonstration : aucun argent ne circule. Les demandes de paiement Mobile Money de votre
            compte arrivent ici.
          </p>
          <div className="mt-5 space-y-3">
            {!signedIn ? (
              <p className="text-sm">
                <Link
                  href="/connexion?retour=/demo/telephone"
                  className="text-brand-700 font-semibold underline"
                >
                  Connectez-vous
                </Link>{" "}
                pour voir vos demandes de paiement.
              </p>
            ) : !result.ok ? (
              <FormAlert>{sandboxMessage(result.code)}</FormAlert>
            ) : (
              <SandboxInbox requests={result.data.items} />
            )}
          </div>
          {signedIn && <AutoRefresh seconds={5} />}
        </div>
      </div>
    </div>
  );
}
