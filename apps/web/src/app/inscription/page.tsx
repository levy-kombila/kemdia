import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { FormAlert } from "@/components/ui/Field";
import { identityApi } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Créer un compte", robots: { index: false } };

export default async function SignupPage() {
  // Bêta fermée (S8-T02) : annoncée avant de remplir le formulaire ; l'API reste juge (INVITATION_REQUISE)
  const beta = await identityApi().betaStatus();
  return (
    <AuthShell
      title="Créer un compte"
      subtitle="Avec votre adresse e-mail (numéro Airtel / Moov : bientôt disponible)."
    >
      {beta.ok && beta.data.closed && (
        <div className="mb-4">
          <FormAlert tone="info">
            Kemdia est en bêta fermée : seules les personnes invitées peuvent créer un compte.
            Utilisez l&apos;adresse e-mail qui a reçu l&apos;invitation.
          </FormAlert>
        </div>
      )}
      <SignupForm />
    </AuthShell>
  );
}
