import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Mot de passe oublié", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Mot de passe oublié"
      subtitle="Nous allons vous envoyer un code pour le réinitialiser."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
