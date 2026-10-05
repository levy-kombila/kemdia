import { CircleUser, Heart, MapPin, Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";

export const metadata: Metadata = { title: "Mon compte", robots: { index: false } };

const FEATURES = [
  { icon: Package, label: "Suivi de mes commandes" },
  { icon: Heart, label: "Liste d'envies" },
  { icon: MapPin, label: "Carnet d'adresses" },
];

export default function AccountPage() {
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Mon compte" }]} />
      <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center shadow-[var(--shadow-card)]">
        <CircleUser className="text-brand-600 mx-auto size-14" aria-hidden />
        <h1 className="mt-3 text-2xl font-extrabold">Espace client</h1>
        <p className="text-ink-500 mt-2">
          La création de compte et la connexion sécurisée arrivent dans une prochaine version de
          Kemdia.
        </p>
        <ul className="mt-6 grid gap-3 text-left sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="bg-ink-50 flex items-center gap-2 rounded-xl p-3 text-sm font-medium"
            >
              <Icon className="text-brand-600 size-5" aria-hidden /> {label}
            </li>
          ))}
        </ul>
        <Link
          href="/"
          className="bg-brand-600 mt-6 inline-block rounded-full px-6 py-3 font-semibold text-white"
        >
          Continuer mes achats
        </Link>
      </div>
    </div>
  );
}
