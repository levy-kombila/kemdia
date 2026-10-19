import { CircleUser, Heart, LogOut, MapPin, MonitorSmartphone, Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { PrivacySection } from "@/components/account/PrivacySection";
import { RoleList } from "@/components/account/RoleList";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { FormAlert } from "@/components/ui/Field";
import { logoutAction, logoutAllAction } from "@/lib/auth/actions";
import { getCurrentAccount } from "@/lib/auth/session";
import type { AccountSummary } from "@/lib/auth/types";
import { formatGabonPhone } from "@/lib/auth/validation";
import { sessionToken } from "@/lib/orders/orders";
import { privacyApi } from "@/lib/privacy/privacy";
import { first } from "@/lib/search-params";
import type { AccountDeletionStatus } from "@kemdia/contracts";

export const metadata: Metadata = { title: "Mon compte", robots: { index: false } };

const FEATURES = [
  { icon: Package, label: "Suivi de mes commandes", href: "/compte/commandes" },
  { icon: Heart, label: "Mes favoris", href: "/favoris" },
  { icon: MapPin, label: "Carnet d'adresses", href: null },
];

function Features() {
  return (
    <ul className="grid gap-3 text-left sm:grid-cols-3">
      {FEATURES.map(({ icon: Icon, label, href }) => {
        const content = (
          <>
            <Icon className="text-brand-600 size-5" aria-hidden /> {label}
            {!href && <span className="text-ink-500 ml-auto text-xs font-normal">bientôt</span>}
          </>
        );
        return (
          <li key={label}>
            {href ? (
              <Link
                href={href}
                className="bg-ink-50 hover:bg-brand-50 flex items-center gap-2 rounded-xl p-3 text-sm font-medium"
              >
                {content}
              </Link>
            ) : (
              <span className="bg-ink-50 flex items-center gap-2 rounded-xl p-3 text-sm font-medium">
                {content}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Guest({ deleted }: { deleted: boolean }) {
  return (
    <div className="mx-auto max-w-xl rounded-xl bg-white p-8 text-center">
      {deleted && (
        <div className="mb-6 text-left">
          <FormAlert tone="info">
            Votre compte a été supprimé et vos données personnelles effacées. Un e-mail de
            confirmation vous a été envoyé.
          </FormAlert>
        </div>
      )}
      <CircleUser className="text-brand-600 mx-auto size-14" aria-hidden />
      <h1 className="mt-3 text-2xl font-extrabold">Espace client</h1>
      <p className="text-ink-500 mt-2">
        Connectez-vous pour suivre vos commandes, retrouver vos favoris et vos adresses.
      </p>
      <div className="mt-6">
        <Features />
      </div>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          href="/connexion?retour=/compte"
          className="bg-brand-600 hover:bg-brand-700 rounded-full px-6 py-3 font-semibold text-white"
        >
          Se connecter
        </Link>
        <Link
          href="/inscription"
          className="border-brand-600 text-brand-700 hover:bg-brand-50 rounded-full border-2 px-6 py-2.5 font-semibold"
        >
          Créer un compte
        </Link>
      </div>
    </div>
  );
}

function SignedIn({
  account,
  error,
  deletion,
}: {
  account: AccountSummary;
  error: boolean;
  deletion: AccountDeletionStatus | null;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {error && (
        <FormAlert>
          La déconnexion de tous vos appareils n&apos;a pas abouti. Réessayez dans quelques
          instants.
        </FormAlert>
      )}
      <section aria-labelledby="identite" className="rounded-xl bg-white p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <span className="bg-brand-50 text-brand-700 flex size-14 shrink-0 items-center justify-center rounded-full text-xl font-extrabold">
            {account.firstName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 id="identite" className="truncate text-2xl font-extrabold">
              {account.firstName} {account.lastName}
            </h1>
            <p className="text-ink-500 truncate text-sm">
              {account.email ?? (account.phone ? formatGabonPhone(account.phone) : "")}
            </p>
          </div>
        </div>
        <RoleList roles={account.roles} />
        <div className="mt-6">
          <Features />
        </div>
      </section>

      <section aria-labelledby="securite" className="rounded-xl bg-white p-6 sm:p-8">
        <h2 id="securite" className="text-lg font-extrabold">
          Connexion et sécurité
        </h2>
        <p className="text-ink-500 mt-1 text-sm">
          Vous restez connecté 30 jours sur cet appareil, prolongés à chaque visite.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <form action={logoutAction}>
            <button
              type="submit"
              className="border-ink-200 hover:bg-ink-50 flex w-full items-center justify-center gap-2 rounded-full border-2 px-5 py-2.5 font-semibold sm:w-auto"
            >
              <LogOut className="size-4" aria-hidden /> Se déconnecter
            </button>
          </form>
          <form action={logoutAllAction}>
            <button
              type="submit"
              className="border-brand-600 text-brand-700 hover:bg-brand-50 flex w-full items-center justify-center gap-2 rounded-full border-2 px-5 py-2.5 font-semibold sm:w-auto"
            >
              <MonitorSmartphone className="size-4" aria-hidden /> Déconnecter tous mes appareils
            </button>
          </form>
        </div>
        <ChangePasswordForm />
        <p className="text-ink-500 mt-3 text-sm">
          Mot de passe actuel oublié ?{" "}
          <Link href="/mot-de-passe-oublie" className="text-brand-700 font-semibold underline">
            Choisir un nouveau mot de passe
          </Link>{" "}
          (vos autres appareils seront déconnectés).
        </p>
      </section>

      <PrivacySection status={deletion} />
    </div>
  );
}

/** Suppression possible ? `null` si l'API ne répond pas (la page reste affichée). */
async function deletionStatus(): Promise<AccountDeletionStatus | null> {
  const token = await sessionToken();
  if (!token) return null;
  const result = await privacyApi().deletionStatus(token);
  return result.ok ? result.data : null;
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [current, params] = await Promise.all([getCurrentAccount(), searchParams]);
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Mon compte" }]} />
      {current.status === "signed-in" ? (
        <SignedIn
          account={current.account}
          error={first(params.erreur) === "indisponible"}
          deletion={await deletionStatus()}
        />
      ) : (
        <Guest deleted={first(params.supprime) === "1"} />
      )}
    </div>
  );
}
