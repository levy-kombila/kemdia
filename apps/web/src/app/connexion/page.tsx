import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { LOGGED_OUT_EVERYWHERE } from "@/lib/auth/messages";
import { getCurrentAccount } from "@/lib/auth/session";
import { first, parseReturnTo } from "@/lib/search-params";

export const metadata: Metadata = { title: "Connexion", robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = parseReturnTo(first(params.retour));
  // Déjà connecté : directement à la page demandée
  if ((await getCurrentAccount()).status === "signed-in") redirect(returnTo);
  const notice = first(params.deconnecte) === "tous" ? LOGGED_OUT_EVERYWHERE : null;
  return (
    <AuthShell title="Connexion" subtitle="Heureux de vous revoir sur Kemdia.">
      <LoginForm returnTo={returnTo} notice={notice} />
    </AuthShell>
  );
}
