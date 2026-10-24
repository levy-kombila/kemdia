import { ChevronRight, Store, Truck, UserRound } from "lucide-react";
import { ProductImage } from "@/components/ui/ProductImage";
import Link from "next/link";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { formatFCFA } from "@/lib/format";
import type { Category, ProductSummary } from "@/lib/types";
import { HeroCarousel } from "./HeroCarousel";

function ProductDisc({
  product,
  className,
  preload = false,
}: {
  product: ProductSummary;
  className?: string;
  /** Image de la 1re bannière : chargée en priorité (c'est le plus grand élément affiché, LCP) */
  preload?: boolean;
}) {
  return (
    <div className={`absolute overflow-hidden rounded-full bg-white shadow-xl ${className ?? ""}`}>
      {product.image && (
        <ProductImage
          src={product.image}
          alt=""
          fill
          sizes="(min-width: 1280px) 256px, (min-width: 640px) 224px, 160px"
          preload={preload}
          className="object-contain p-3"
        />
      )}
    </div>
  );
}

const slideBase =
  "relative flex h-64 overflow-hidden px-5 pb-10 pt-5 sm:h-72 sm:px-10 sm:py-6 lg:h-full";
const ctaClass =
  "mt-4 inline-flex h-10 items-center whitespace-nowrap rounded-full px-5 text-sm font-bold transition sm:mt-5 sm:h-12 sm:px-6 sm:text-base";

/**
 * En-tête de l'accueil, organisé comme sur les grandes places de marché :
 * catégories à gauche, bannières au centre, raccourcis compte / vendeur à droite.
 */
export function Hero({
  categories,
  techDeals,
  cheapestTech,
  fashion,
  account = null,
}: {
  categories: Category[];
  techDeals: ProductSummary[];
  cheapestTech: number;
  fashion: ProductSummary[];
  /** Compte connecté (S8-T08) : `null` pour un visiteur */
  account?: HeroAccount;
}) {
  const slides = [
    <div key="tech" className={`${slideBase} bg-brand-600 text-white`}>
      <div className="relative z-10 max-w-[60%] self-center sm:max-w-md">
        <p className="hidden text-base font-semibold text-white sm:block">
          Smartphones, ordinateurs, audio
        </p>
        <h2 className="mt-1 text-2xl font-extrabold leading-[1.05] sm:text-4xl xl:text-5xl">
          Le high-tech au prix du marché
        </h2>
        <p className="bg-accent-400 text-ink-900 font-price mt-3 inline-block -rotate-2 rounded-md px-2 py-1 text-lg sm:text-2xl">
          dès {formatFCFA(cheapestTech)}
        </p>
        <div>
          <Link
            prefetch={false}
            href="/categorie/high-tech"
            className={`${ctaClass} text-brand-700 bg-white hover:bg-white/90`}
          >
            Voir le high-tech
          </Link>
        </div>
      </div>
      {techDeals[0] && (
        <ProductDisc
          preload
          product={techDeals[0]}
          className="-right-6 top-6 size-40 sm:right-10 sm:size-56 xl:size-64"
        />
      )}
      {techDeals[1] && (
        <ProductDisc
          product={techDeals[1]}
          className="bottom-3 right-28 hidden size-32 sm:block lg:right-64 lg:size-40"
        />
      )}
    </div>,

    <div key="paiement" className={`${slideBase} bg-ink-900 text-white`}>
      <div className="relative z-10 max-w-xl self-center">
        <p className="hidden text-base font-semibold text-white sm:block">
          Paiement 100 % sécurisé
        </p>
        <h2 className="mt-1 text-2xl font-extrabold leading-[1.05] sm:text-4xl xl:text-5xl">
          Payez avec votre téléphone
        </h2>
        <ul className="mt-4 flex flex-wrap gap-2 text-sm font-bold sm:text-base">
          <li className="text-ink-900 rounded-full bg-white px-3 py-1.5">Airtel Money</li>
          <li className="text-ink-900 rounded-full bg-white px-3 py-1.5">Moov Money</li>
          <li className="rounded-full border border-white/40 px-3 py-1.5">À la livraison</li>
        </ul>
        <div>
          <Link
            prefetch={false}
            href="/infos/paiement"
            className={`${ctaClass} bg-accent-400 text-ink-900 hover:bg-accent-300`}
          >
            Comment payer
          </Link>
        </div>
      </div>
      <div
        aria-hidden
        className="bg-brand-600 absolute -right-16 -top-16 hidden size-72 rounded-full sm:block"
      />
      <div
        aria-hidden
        className="bg-accent-400 absolute -bottom-20 right-24 hidden size-48 rounded-full sm:block"
      />
    </div>,

    <div key="livraison" className={`${slideBase} bg-accent-400 text-ink-900`}>
      <div className="relative z-10 max-w-[62%] self-center sm:max-w-lg">
        <p className="hidden text-base font-semibold sm:block">Libreville, Owendo, Akanda</p>
        <h2 className="mt-1 text-2xl font-extrabold leading-[1.05] sm:text-4xl xl:text-5xl">
          Livraison offerte dès 25 000 FCFA
        </h2>
        <p className="mt-2 hidden text-base sm:block">
          Chez vous en 24 à 48 h. Partout au Gabon en 2 à 7 jours.
        </p>
        <div>
          <Link
            prefetch={false}
            href="/infos/livraison"
            className={`${ctaClass} bg-ink-900 hover:bg-ink-800 text-white`}
          >
            Zones et délais
          </Link>
        </div>
      </div>
      <Truck
        aria-hidden
        strokeWidth={1.25}
        className="text-ink-900/15 absolute -right-6 bottom-0 size-52 sm:right-6 sm:size-72"
      />
      {fashion[0] && (
        <ProductDisc product={fashion[0]} className="right-6 top-6 hidden size-36 lg:block" />
      )}
    </div>,
  ];

  return (
    <section className="grid grid-cols-1 gap-3 lg:h-[26.5rem] lg:grid-cols-[14rem_1fr] xl:grid-cols-[14rem_1fr_15rem]">
      <nav aria-label="Catégories" className="hidden rounded-xl bg-white py-2 lg:block">
        <ul>
          {categories.map((c) => (
            <li key={c.id}>
              <Link
                prefetch={false}
                href={`/categorie/${c.slug}`}
                className="hover:bg-ink-50 hover:text-brand-700 flex items-center gap-3 px-4 py-2.5 text-sm font-medium"
              >
                <CategoryIcon name={c.icon} className="text-ink-500 size-[1.1rem]" />
                <span className="flex-1">{c.name}</span>
                <ChevronRight className="text-ink-400 size-4" aria-hidden />
              </Link>
            </li>
          ))}
          <li>
            <Link
              prefetch={false}
              href="/promotions"
              className="hover:bg-ink-50 text-brand-700 flex items-center gap-3 px-4 py-2.5 text-sm font-semibold"
            >
              <span className="font-price bg-accent-400 text-ink-900 grid size-[1.1rem] place-items-center rounded text-[0.6rem]">
                %
              </span>
              Promotions
            </Link>
          </li>
          <li className="border-ink-100 mt-1 border-t pt-1">
            <Link
              prefetch={false}
              href="/categories"
              className="text-ink-500 hover:text-brand-700 block px-4 py-2.5 text-sm"
            >
              Toutes les catégories
            </Link>
          </li>
        </ul>
      </nav>

      <HeroCarousel
        slides={slides}
        labels={[
          "Le high-tech au prix du marché",
          "Payez avec votre téléphone",
          "Livraison offerte dès 25 000 FCFA",
        ]}
      />

      <HeroAccountPanel account={account} />
    </section>
  );
}

/** Ce que l'encart du compte doit savoir (S8-T08) : prénom, et si le compte a une boutique (rôle vendeur). */
export type HeroAccount = { firstName: string; vendor: boolean } | null;

const primaryButton =
  "bg-brand-600 hover:bg-brand-700 rounded-full py-2 text-center text-sm font-semibold text-white";
const secondaryButton =
  "border-ink-200 hover:border-ink-900 rounded-full border py-2 text-center text-sm font-semibold";

/**
 * Raccourcis à droite de la bannière (ordinateur). S8-T08 : selon le visiteur —
 * - visiteur : « Se connecter » et « Créer un compte » ; client connecté : ses commandes et son compte ;
 * - vendeur : « Accéder à votre boutique » (espace vendeur) au lieu de « Devenir vendeur ».
 */
export function HeroAccountPanel({ account }: { account: HeroAccount }) {
  return (
    <div className="hidden flex-col gap-3 xl:flex">
      <div className="flex flex-1 flex-col rounded-xl bg-white p-4">
        <span className="bg-ink-50 grid size-10 place-items-center rounded-full">
          <UserRound className="text-ink-700 size-5" aria-hidden />
        </span>
        {account ? (
          <>
            <p className="mt-2 truncate font-bold">Bonjour, {account.firstName}</p>
            <p className="text-ink-500 text-sm">Suivez vos commandes et retrouvez vos favoris.</p>
            <div className="mt-auto grid gap-2 pt-3">
              <Link prefetch={false} href="/compte/commandes" className={primaryButton}>
                Mes commandes
              </Link>
              <Link prefetch={false} href="/compte" className={secondaryButton}>
                Mon compte
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 font-bold">Bienvenue sur Kemdia</p>
            <p className="text-ink-500 text-sm">Suivez vos commandes et retrouvez vos favoris.</p>
            <div className="mt-auto grid gap-2 pt-3">
              <Link prefetch={false} href="/connexion" className={primaryButton}>
                Se connecter
              </Link>
              <Link prefetch={false} href="/inscription" className={secondaryButton}>
                Créer un compte
              </Link>
            </div>
          </>
        )}
      </div>
      <Link
        prefetch={false}
        href={account?.vendor ? "/vendeur" : "/vendre"}
        className="bg-forest-600 hover:bg-forest-700 group flex flex-col rounded-xl p-4 text-white"
      >
        <Store className="size-6" aria-hidden />
        {account?.vendor ? (
          <>
            <span className="mt-2 font-bold">Votre boutique Kemdia</span>
            <span className="text-sm text-white">
              Gérez vos produits, vos commandes et vos ventes.
            </span>
            <span className="mt-2 text-sm font-semibold underline-offset-2 group-hover:underline">
              Accéder à votre boutique
            </span>
          </>
        ) : (
          <>
            <span className="mt-2 font-bold">Vendez sur Kemdia</span>
            <span className="text-sm text-white">
              Ouvrez votre boutique et touchez tout le Gabon.
            </span>
            <span className="mt-2 text-sm font-semibold underline-offset-2 group-hover:underline">
              Devenir vendeur
            </span>
          </>
        )}
      </Link>
    </div>
  );
}
