import { RotateCcw, ShieldCheck, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { SectionHeader } from "@/components/home/SectionHeader";
import { BuyBox } from "@/components/product/BuyBox";
import { ProductCard, toCartLine } from "@/components/product/ProductCard";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductRail, RailItem } from "@/components/product/ProductRail";
import { Price } from "@/components/ui/Price";
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
    <div className="container-page py-6">
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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ProductGallery images={product.images} title={product.title} />

        <div className="rounded-3xl bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
          {product.brand && (
            <p className="text-ink-500 mb-1 text-sm font-semibold uppercase tracking-wide">
              {product.brand}
            </p>
          )}
          <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">{product.title}</h1>
          <div className="mt-2">
            <Rating value={product.rating} count={product.reviewCount} size="md" />
          </div>

          <div className="my-5 flex items-center gap-3">
            <Price price={product.price} oldPrice={product.oldPrice} size="lg" />
            {discount && (
              <span className="bg-accent-400 rounded-full px-2.5 py-1 text-sm font-extrabold">
                -{discount}%
              </span>
            )}
          </div>

          <BuyBox line={toCartLine(product)} />

          <ul className="border-ink-100 mt-6 grid gap-3 border-t pt-6 text-sm sm:grid-cols-3">
            <li className="flex items-center gap-2">
              <Smartphone className="text-brand-600 size-5" aria-hidden /> Airtel / Moov Money
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="text-brand-600 size-5" aria-hidden /> Paiement sécurisé
            </li>
            <li className="flex items-center gap-2">
              <RotateCcw className="text-brand-600 size-5" aria-hidden /> Retour sous 14 jours
            </li>
          </ul>
        </div>
      </div>

      <section
        className="mt-8 rounded-3xl bg-white p-6 shadow-[var(--shadow-card)] sm:p-8"
        aria-labelledby="description"
      >
        <h2 id="description" className="mb-3 text-xl font-bold">
          Description
        </h2>
        <p className="text-ink-700 max-w-3xl whitespace-pre-line leading-7">
          {product.description}
        </p>
        <dl className="mt-6 grid max-w-xl grid-cols-[8rem_1fr] gap-y-2 text-sm">
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
          <dt className="text-ink-500">Catégorie</dt>
          <dd className="font-medium">{path.map((c) => c.name).join(" › ")}</dd>
          <dt className="text-ink-500">Référence</dt>
          <dd className="font-medium">KMD-{product.id.padStart(5, "0")}</dd>
        </dl>
      </section>

      {related.length > 0 && (
        <section className="mt-12" aria-labelledby="similaires">
          <SectionHeader id="similaires" title="Vous aimerez" highlight="aussi" />
          <ProductRail label="Produits similaires">
            {related.map((p) => (
              <RailItem key={p.id}>
                <ProductCard product={p} />
              </RailItem>
            ))}
          </ProductRail>
        </section>
      )}
    </div>
  );
}
