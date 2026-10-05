import {
  Headset,
  Lock,
  Mail,
  PackageCheck,
  Phone,
  RotateCcw,
  Smartphone,
  Star,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { INFO_PAGES, SITE, type InfoSlug } from "@/lib/site";

const COLUMNS: { title: string; links: InfoSlug[] }[] = [
  { title: "À propos", links: ["a-propos", "contact"] },
  { title: "Service client", links: ["centre-aide", "livraison", "paiement"] },
  { title: "Informations légales", links: ["mentions-legales", "confidentialite", "cgv"] },
];

const BADGES = [
  { icon: Lock, text: "Paiement sécurisé" },
  { icon: Truck, text: "Livraison 24/48 h à Libreville" },
  { icon: RotateCcw, text: "Retours sous 14 jours" },
  { icon: Star, text: "Avis clients vérifiés" },
];

export function Footer() {
  return (
    <footer className="bg-ink-900 mt-16 text-white/70">
      <div className="border-b border-white/10">
        <div className="container-page grid grid-cols-2 gap-4 py-6 md:grid-cols-4">
          {BADGES.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 text-sm">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/5">
                <Icon className="text-accent-400 size-5" aria-hidden />
              </span>
              {text}
            </div>
          ))}
        </div>
      </div>

      <div className="container-page grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo inverted />
          <p className="mt-4 max-w-sm text-sm leading-6">{SITE.description}</p>
          <ul className="mt-5 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Phone className="text-brand-500 size-4" aria-hidden /> {SITE.supportPhone}
            </li>
            <li className="flex items-center gap-2">
              <Mail className="text-brand-500 size-4" aria-hidden /> {SITE.supportEmail}
            </li>
            <li className="flex items-center gap-2">
              <Headset className="text-brand-500 size-4" aria-hidden /> 7j/7, de 8 h à 20 h
            </li>
          </ul>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h2 className="font-display mb-4 text-sm font-bold uppercase tracking-wide text-white">
              {col.title}
            </h2>
            <ul className="space-y-2.5 text-sm">
              {col.links.map((slug) => (
                <li key={slug}>
                  <Link href={`/infos/${slug}`} className="hover:text-white">
                    {INFO_PAGES[slug]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10">
        <div className="container-page flex flex-col items-center justify-between gap-4 py-6 text-xs md:flex-row">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1">Moyens de paiement :</span>
            {[
              { icon: Smartphone, label: "Airtel Money" },
              { icon: Smartphone, label: "Moov Money" },
              { icon: Wallet, label: "Carte bancaire" },
              { icon: PackageCheck, label: "Paiement à la livraison" },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1">
                <Icon className="size-3.5" aria-hidden /> {label}
              </span>
            ))}
          </div>
          <p className="flex items-center gap-2">
            <span aria-hidden className="flex h-3 w-5 flex-col overflow-hidden rounded-[2px]">
              <span className="bg-gabon-green flex-1" />
              <span className="bg-gabon-yellow flex-1" />
              <span className="bg-gabon-blue flex-1" />
            </span>
            © {new Date().getFullYear()} {SITE.name}. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  );
}
