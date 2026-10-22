import { ShieldCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RegenerateCodesForm } from "@/components/staff/RegenerateCodesForm";
import { SecondFactorSetup } from "@/components/staff/SecondFactorSetup";
import { StaffShell, StatusBadge } from "@/components/staff/StaffShell";
import { FormAlert } from "@/components/ui/Field";
import { formatTime } from "@/lib/format";
import { staffErrorMessage } from "@/lib/staff/messages";
import { confirmedUntil } from "@/lib/staff/roles";
import { readSecondFactor, requireTeamMember } from "@/lib/staff/staff";

export const metadata: Metadata = { title: "Sécurité" };

/** Seuil d'alerte : il reste peu de codes de secours. */
const FEW_CODES = 3;

/**
 * Double authentification du membre de l'équipe (S6-T05) : activation, état de la session, codes de secours. Cette
 * page est la seule de l'espace accessible SANS double authentification confirmée (il faut bien pouvoir l'activer).
 */
export default async function SecurityPage() {
  const member = await requireTeamMember("/equipe/securite");
  const { account } = member;
  const status = await readSecondFactor(member, "/equipe/securite");

  if (!status.ok) {
    return (
      <StaffShell
        section="securite"
        roles={account.roles}
        title="Sécurité"
        crumbs={[{ label: "Sécurité" }]}
      >
        <FormAlert>{staffErrorMessage(status.code)}</FormAlert>
      </StaffShell>
    );
  }

  const factor = status.data;
  const verified = confirmedUntil(factor);

  return (
    <StaffShell
      section="securite"
      roles={account.roles}
      title="Sécurité"
      crumbs={[{ label: "Sécurité" }]}
    >
      {!factor.enabled ? (
        <>
          <FormAlert tone="info">
            La double authentification est <strong>obligatoire</strong> pour l&apos;équipe : en plus
            du mot de passe, un code à 6 chiffres donné par une application de votre téléphone
            protège le travail de l&apos;équipe, même si votre mot de passe est volé.
          </FormAlert>
          <SecondFactorSetup />
        </>
      ) : (
        <>
          <section aria-labelledby="etat" className="space-y-3 rounded-xl bg-white p-6">
            <h2 id="etat" className="flex items-center gap-2 text-lg font-extrabold">
              <ShieldCheck className="text-forest-700 size-5" aria-hidden /> Double authentification{" "}
              <StatusBadge tone="ok">activée</StatusBadge>
            </h2>
            <p className="text-sm">
              {verified ? (
                <>
                  Session confirmée jusqu&apos;à <strong>{formatTime(verified)}</strong>. Le code
                  vous sera redemandé ensuite.
                </>
              ) : (
                <>
                  Session pas encore confirmée.{" "}
                  <Link href="/equipe/confirmer" className="text-brand-700 font-semibold underline">
                    Saisir mon code
                  </Link>
                </>
              )}
            </p>
            <p className="text-sm">
              Codes de secours encore utilisables : <strong>{factor.recoveryCodesLeft}</strong>
            </p>
            {factor.recoveryCodesLeft <= FEW_CODES && (
              <FormAlert>
                <TriangleAlert className="mr-1 inline size-4" aria-hidden /> Il vous reste peu de
                codes de secours : créez-en de nouveaux ci-dessous.
              </FormAlert>
            )}
          </section>
          <section aria-labelledby="secours" className="space-y-3 rounded-xl bg-white p-6">
            <h2 id="secours" className="text-lg font-extrabold">
              Nouveaux codes de secours
            </h2>
            <RegenerateCodesForm />
          </section>
          <section aria-labelledby="perdu" className="space-y-2 rounded-xl bg-white p-6 text-sm">
            <h2 id="perdu" className="text-lg font-extrabold">
              Téléphone perdu et plus de codes de secours ?
            </h2>
            <p className="text-ink-700">
              Prévenez l&apos;exploitant de Kemdia : il peut remettre votre double authentification
              à zéro depuis le serveur. Par sécurité, toutes vos sessions seront fermées et vous
              devrez choisir un nouveau mot de passe avec « Mot de passe oublié ».
            </p>
          </section>
        </>
      )}
    </StaffShell>
  );
}
