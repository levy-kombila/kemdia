import { Suspense } from "react";
import { CategoryTiles } from "@/components/home/CategoryTiles";
import { HydrateWhenVisible } from "@/components/home/HydrateWhenVisible";
import { SectionHeader } from "@/components/home/SectionHeader";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductRail, RailItem } from "@/components/product/ProductRail";
import {
  getBestsellers,
  getCategoryTiles,
  getFeaturedProducts,
  getNewProducts,
  listProducts,
} from "@/lib/catalog";

/**
 * Sections de l'accueil situées SOUS la ligne de flottaison (S3-T08, chargement progressif).
 *
 * Chacune lit ses données et s'affiche dans sa propre zone `<Suspense>` :
 * - le haut de la page (bannière, ronds, ventes flash) part au navigateur sans attendre le reste ;
 * - surtout, React rend la page interactive **zone par zone**, en rendant la main au navigateur entre deux zones,
 *   au lieu d'un seul long calcul pour ~50 cartes produits : c'est ce qui bloquait le fil principal (TBT).
 *
 * Le contenu reste dans le HTML (référencement, partage) : rien n'est chargé « au défilement ».
 * La zone d'attente réserve une hauteur proche du contenu final, pour éviter les sauts de mise en page.
 */

function Placeholder({ className }: { className: string }) {
  return <div aria-hidden className={`rounded-xl bg-white ${className}`} />;
}

function RailSection({
  id,
  title,
  href,
  children,
}: {
  id: string;
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl bg-white px-3 pb-3 pt-4 sm:px-5">
      <SectionHeader id={id} title={title} href={href} />
      {children}
    </section>
  );
}

async function TilesSection() {
  return <CategoryTiles tiles={await getCategoryTiles()} />;
}

async function BestsellersSection() {
  const products = await getBestsellers(10);
  return (
    <RailSection id="meilleures-ventes" title="Les plus vendus" href="/recherche?tri=note">
      <ProductRail label="Les plus vendus">
        {products.map((p, i) => (
          <RailItem key={p.id}>
            <ProductCard product={p} badge="bestseller" rank={i < 3 ? i + 1 : undefined} />
          </RailItem>
        ))}
      </ProductRail>
    </RailSection>
  );
}

async function FeaturedSection() {
  const products = await getFeaturedProducts(10);
  return (
    <RailSection id="vedette" title="Choisis pour vous" href="/recherche">
      <ProductRail label="Choisis pour vous">
        {products.map((p) => (
          <RailItem key={p.id}>
            <ProductCard product={p} />
          </RailItem>
        ))}
      </ProductRail>
    </RailSection>
  );
}

async function NewSection() {
  const products = await getNewProducts(10);
  return (
    <RailSection id="nouveautes" title="Nouveautés de la semaine" href="/recherche?tri=nouveautes">
      <ProductRail label="Nouveautés">
        {products.map((p) => (
          <RailItem key={p.id}>
            <ProductCard product={p} badge="new" />
          </RailItem>
        ))}
      </ProductRail>
    </RailSection>
  );
}

async function MoreSection() {
  const { items } = await listProducts({ pageSize: 12, sort: "nouveautes" });
  return (
    <section aria-labelledby="tous-produits" className="pt-2">
      <SectionHeader id="tous-produits" title="Encore plus de produits" href="/recherche" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

/**
 * Zone hors écran : le navigateur ne calcule sa mise en page qu'à l'approche du défilement (`content-visibility: auto`).
 * Mesuré au S3-T08 : la mise en page des ~50 cartes de l'accueil coûtait à elle seule ~250 ms de blocage sur téléphone.
 * `contain-intrinsic-size` donne la hauteur à réserver tant que la zone n'a pas été affichée (évite les sauts),
 * puis le navigateur retient la vraie hauteur (`auto`).
 */
function Deferred({ height, children }: { height: string; children: React.ReactNode }) {
  return (
    <div className="[content-visibility:auto]" style={{ containIntrinsicSize: `auto ${height}` }}>
      <HydrateWhenVisible>{children}</HydrateWhenVisible>
    </div>
  );
}

/** Hauteurs indicatives (téléphone) : rangée de cartes, tuiles, grille de 12 cartes. */
const RAIL = "26rem";

export function HomeBelowFold() {
  return (
    <>
      <Deferred height="42rem">
        <Suspense fallback={<Placeholder className="h-[42rem] sm:h-[34rem] xl:h-[20rem]" />}>
          <TilesSection />
        </Suspense>
      </Deferred>
      <Deferred height={RAIL}>
        <Suspense fallback={<Placeholder className="h-[26rem]" />}>
          <BestsellersSection />
        </Suspense>
      </Deferred>
      <Deferred height={RAIL}>
        <Suspense fallback={<Placeholder className="h-[26rem]" />}>
          <FeaturedSection />
        </Suspense>
      </Deferred>
      <Deferred height={RAIL}>
        <Suspense fallback={<Placeholder className="h-[26rem]" />}>
          <NewSection />
        </Suspense>
      </Deferred>
      <Deferred height="120rem">
        <Suspense fallback={<Placeholder className="h-[120rem] sm:h-[90rem] lg:h-[50rem]" />}>
          <MoreSection />
        </Suspense>
      </Deferred>
    </>
  );
}
