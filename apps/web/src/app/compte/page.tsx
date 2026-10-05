import { CircleUser, Heart, MapPin, Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";

export const metadata: Metadata = { title: "Mon compte", robots: { index: false } };

const FEATURES = [
  { icon: Package, label: "Suivi de mes commandes", href: null },
  { icon: Heart, label: "Mes favoris", href: "/favoris" },
  { icon: MapPin, label: "Carnet d'adresses", href: null },
];

export default function AccountPage() {
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Mon compte" }]} />
      <div className="mx-auto max-w-xl rounded-xl bg-white p-8 text-center">
        <CircleUser className="text-brand-600 mx-auto size-14" aria-hidden />
        <h1 className="mt-3 text-2xl font-extrabold">Espace client</h1>
        <p className="text-ink-500 mt-2">
          Connectez-vous pour suivre vos commandes, retrouver vos favoris et vos adresses.
        </p>
        <ul className="mt-6 grid gap-3 text-left sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, label, href }) => {
            const content = (
              <>
                <Icon className="text-brand-600 size-5" aria-hidden /> {label}
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
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/connexion"
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
    </div>
  );
}
