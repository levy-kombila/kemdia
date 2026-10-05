import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { first, parseReturnTo } from "@/lib/search-params";

export const metadata: Metadata = { title: "Connexion", robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <AuthShell title="Connexion" subtitle="Heureux de vous revoir sur Kemdia.">
      <LoginForm returnTo={parseReturnTo(first(params.retour))} />
    </AuthShell>
  );
}
