import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { SectionHeader } from "@/components/home/SectionHeader";
import { BuyBox } from "@/components/product/BuyBox";
import { ProductCard, toCartLine } from "@/components/product/ProductCard";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductRail, RailItem } from "@/components/product/ProductRail";
import { StickyBuyBar } from "@/components/product/StickyBuyBar";
import { DiscountSticker, Price } from "@/components/ui/Price";
import { Rating } from "@/components/ui/Rating";
import {
  getAllProductSlugs,
  getCategoryPath,
  getProductBySlug,
  getRelatedProducts,
} from "@/lib/catalog";
import { discountPercent } from "@/lib/format";
import { SITE } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getAllProductSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = getProductBySlug((await params).slug);
  if (!product) return { title: "Produit introuvable" };
  return {
    title: product.title,
    description: product.description.slice(0, 155),
    alternates: { canonical: `/produit/${product.slug}` },
    openGraph: { images: product.images.slice(0, 1) },
  };
}

export default async function ProductPage({ params }: Props) {
  const product = getProductBySlug((await params).slug);
  if (!product) notFound();

  const path = getCategoryPath(product.categoryId);
  const related = getRelatedProducts(product, 10);
  const discount = discountPercent(product.price, product.oldPrice);
  const line = toCartLine(product);

  // Données structurées pour Google (rich snippets prix / disponibilité)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    image: product.images.map((i) => `${SITE.url}${i}`),
    description: product.description,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    aggregateRating:
      product.reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
          }
        : undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "XAF",
      price: product.price,
      availability:
        product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${SITE.url}/produit/${product.slug}`,
    },
  };

  return (
    <div className="container-page py-4">
      <script
        type="application/ld+json"
        // Données structurées (méthode recommandée par Next.js) : JSON.stringify + échappement de « < »
        // empêche toute fermeture prématurée de la balise. Contenu issu du catalogue, pas de l'URL.
        // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Breadcrumbs
        items={[
          ...path.map((c) => ({ label: c.name, href: `/categorie/${c.slug}` })),
          { label: product.title },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr] xl:grid-cols-[1.25fr_1fr_20rem]">
        <ProductGallery images={product.images} title={product.title} />

        <div className="rounded-xl bg-white p-5 sm:p-6">
          {product.brand && (
            <Link
              href={`/recherche?q=${encodeURIComponent(product.brand)}`}
              className="text-brand-700 text-sm font-semibold hover:underline"
            >
              Marque : {product.brand}
            </Link>
          )}
          <h1 className="mt-1 text-2xl font-extrabold leading-tight sm:text-[1.75rem]">
            {product.title}
          </h1>
          <a href="#avis" className="mt-2 inline-flex hover:underline">
            <Rating value={product.rating} count={product.reviewCount} size="md" />
          </a>

          <div className="border-ink-100 my-4 border-y py-4">
            <div className="flex items-start gap-3">
              <Price price={product.price} oldPrice={product.oldPrice} size="lg" showSavings />
              {discount && <DiscountSticker percent={discount} className="mt-1 text-lg" />}
            </div>
            <p className="text-ink-500 mt-1 text-xs">Prix en francs CFA, toutes taxes comprises</p>
          </div>

          <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
            {product.brand && (
              <>
                <dt className="text-ink-500">Marque</dt>
                <dd className="font-medium">{product.brand}</dd>
              </>
            )}
            {product.color && (
              <>
                <dt className="text-ink-500">Couleur</dt>
                <dd className="font-medium">{product.color}</dd>
              </>
            )}
            <dt className="text-ink-500">Rayon</dt>
            <dd className="font-medium">{path.at(-1)?.name}</dd>
            <dt className="text-ink-500">Référence</dt>
            <dd className="font-medium">KMD-{product.id.padStart(5, "0")}</dd>
          </dl>

          {/* Encadré d'achat ici sur tablette ; colonne de droite sur grand écran */}
          <div className="border-ink-100 mt-5 border-t pt-5 xl:hidden">
            <BuyBox line={line} />
          </div>
        </div>

        <aside
          className="hidden self-start rounded-xl bg-white p-5 xl:sticky xl:top-36 xl:block"
          aria-label="Acheter"
        >
          <BuyBox line={line} />
        </aside>
      </div>

      <nav
        aria-label="Sections de la fiche"
        className="border-ink-100 scrollbar-none mt-3 flex gap-6 overflow-x-auto rounded-t-xl border-b bg-white px-5 text-sm font-semibold sm:px-6"
      >
        {[
          ["#description", "Description"],
          ["#caracteristiques", "Caractéristiques"],
          ["#avis", "Avis clients"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="hover:border-brand-600 hover:text-brand-700 shrink-0 border-b-2 border-transparent py-3.5"
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="divide-ink-100 grid divide-y rounded-b-xl bg-white px-5 sm:px-6">
        <section aria-labelledby="description" className="scroll-mt-40 py-6">
          <h2 id="description" className="mb-3 text-lg font-bold">
            Description
          </h2>
          <p className="text-ink-700 max-w-3xl whitespace-pre-line leading-7">
            {product.description}
          </p>
        </section>
        <section aria-labelledby="caracteristiques" className="scroll-mt-40 py-6">
          <h2 id="caracteristiques" className="mb-3 text-lg font-bold">
            Caractéristiques
          </h2>
          <table className="w-full max-w-2xl text-sm">
            <tbody className="divide-ink-100 divide-y">
              {[
                ["Marque", product.brand],
                ["Couleur", product.color],
                ["Catégorie", path.map((c) => c.name).join(" › ")],
                ["Référence", `KMD-${product.id.padStart(5, "0")}`],
              ]
                .filter((row): row is [string, string] => Boolean(row[1]))
                .map(([k, v]) => (
                  <tr key={k}>
                    <th
                      scope="row"
                      className="bg-ink-50 text-ink-500 w-40 px-3 py-2.5 text-left font-medium"
                    >
                      {k}
                    </th>
                    <td className="px-3 py-2.5 font-medium">{v}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
        <section aria-labelledby="avis" className="scroll-mt-40 py-6">
          <h2 id="avis" className="mb-3 text-lg font-bold">
            Avis clients
          </h2>
          {product.reviewCount > 0 ? (
            <div className="flex items-center gap-4">
              <p className="font-price text-5xl">{product.rating.toFixed(1).replace(".", ",")}</p>
              <div>
                <Rating value={product.rating} size="md" />
                <p className="text-ink-500 text-sm">
                  Moyenne de {product.reviewCount} avis d&apos;acheteurs
                </p>
              </div>
            </div>
          ) : (
            <p className="text-ink-500">Aucun avis pour le moment.</p>
          )}
          <p className="text-ink-500 mt-3 text-sm">
            Seuls les clients ayant reçu ce produit peuvent donner leur avis.
          </p>
        </section>
      </div>

      {related.length > 0 && (
        <section
          className="mt-3 rounded-xl bg-white px-3 pb-3 pt-4 sm:px-5"
          aria-labelledby="similaires"
        >
          <SectionHeader id="similaires" title="Vous aimerez aussi" />
          <ProductRail label="Produits similaires">
            {related.map((p) => (
              <RailItem key={p.id}>
                <ProductCard product={p} />
              </RailItem>
            ))}
          </ProductRail>
        </section>
      )}
      <StickyBuyBar line={line} oldPrice={product.oldPrice} />
    </div>
  );
}
