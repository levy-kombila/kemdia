import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Créer un compte", robots: { index: false } };

export default function SignupPage() {
  return (
    <AuthShell
      title="Créer un compte"
      subtitle="Avec votre numéro Airtel / Moov ou votre adresse e-mail."
    >
      <SignupForm />
    </AuthShell>
  );
}
