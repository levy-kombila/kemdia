import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StaffShell } from "@/components/staff/StaffShell";
import { VerifyCodeForm } from "@/components/staff/VerifyCodeForm";
import { FormAlert } from "@/components/ui/Field";
import { first } from "@/lib/search-params";
import { staffErrorMessage } from "@/lib/staff/messages";
import { confirmedUntil, staffPath } from "@/lib/staff/roles";
import { readSecondFactor, requireTeamMember } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Confirmer mon identité" };

/**
 * Saisie du code de la double authentification (S6-T05) : la session est confirmée pour 15 minutes (ADR-0034), puis
 * retour à la page de l'équipe demandée (`?retour=`, seulement une page de l'équipe).
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const returnTo = staffPath(first((await searchParams).retour));
  const member = await requireTeamMember(returnTo);
  const { account } = member;
  const status = await readSecondFactor(member, returnTo);
  if (status.ok) {
    if (!status.data.enabled) redirect("/equipe/securite");
    // Déjà confirmée : rien à saisir
    if (confirmedUntil(status.data)) redirect(returnTo);
  }

  return (
    <StaffShell
      section="securite"
      roles={account.roles}
      title="Confirmez votre identité"
      crumbs={[{ label: "Confirmer mon identité" }]}
    >
      {!status.ok ? (
        <FormAlert>{staffErrorMessage(status.code)}</FormAlert>
      ) : (
        <>
          <p className="text-ink-700">
            Ouvrez votre application d&apos;authentification et saisissez le code affiché pour
            Kemdia. Vous ne le ressaisirez pas avant 15 minutes.
          </p>
          <div className="max-w-md">
            <VerifyCodeForm returnTo={returnTo} />
          </div>
        </>
      )}
    </StaffShell>
  );
}
