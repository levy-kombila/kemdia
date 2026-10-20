import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { SectionHeader } from "@/components/home/SectionHeader";
import { BuyBox } from "@/components/product/BuyBox";
import { OtherSellers } from "@/components/product/OtherSellers";
import { FavoriteButton } from "@/components/product/FavoriteButton";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductRail, RailItem } from "@/components/product/ProductRail";
import { ShareButtons } from "@/components/product/ShareButtons";
import { StickyBuyBar } from "@/components/product/StickyBuyBar";
import { VariantPicker } from "@/components/product/VariantPicker";
import { DiscountSticker, Price } from "@/components/ui/Price";
import { Rating } from "@/components/ui/Rating";
import { getProduct, getRelatedProducts } from "@/lib/catalog";
import { getCity } from "@/lib/delivery";
import { discountPercent, formatFCFA } from "@/lib/format";
import {
  attributeRows,
  currentOffer,
  detailCartLine,
  detailFavorite,
  selectVariant,
} from "@/lib/product-view";
import { first } from "@/lib/search-params";
import { SITE, siteUrl } from "@/lib/site";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Rendu à la demande : l'adresse absolue des aperçus (WhatsApp, Facebook) vient de SITE_URL au démarrage,
// et le catalogue n'est jamais lu pendant la construction (S3-T05).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) return { title: "Produit introuvable" };
  const price = formatFCFA(product.price);
  const discount = discountPercent(product.price, product.compareAtPrice);
  // Texte affiché sous l'image dans WhatsApp : le prix d'abord, c'est ce qui fait cliquer
  const description = `${price}${discount ? ` (-${discount} %)` : ""} · Livraison partout au Gabon · Paiement Airtel Money et Moov Money`;
  return {
    title: product.title,
    description: product.description.slice(0, 155),
    alternates: { canonical: `/produit/${product.slug}` },
    // L'image d'aperçu (1200 × 630) est générée par opengraph-image.tsx, dans ce même dossier
    openGraph: {
      type: "website",
      url: `/produit/${product.slug}`,
      title: `${product.title} — ${price}`,
      description,
      siteName: SITE.name,
      locale: SITE.locale,
    },
    twitter: { card: "summary_large_image", title: `${product.title} — ${price}`, description },
    other: {
      "product:price:amount": String(product.price),
      "product:price:currency": "XAF",
      "product:availability": product.inStock ? "in stock" : "out of stock",
    },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const [{ slug }, sp, jar] = await Promise.all([params, searchParams, cookies()]);
  // Ville de livraison choisie (cookie posé par le site) : à prix égal, la boutique de cette ville d'abord (S7.5-T03)
  const city = getCity(jar.get("kemdia_ville")?.value)?.name;
  const product = await getProduct(slug, city);
  if (!product) notFound();

  const variant = selectVariant(product, first(sp.variante));
  const path = product.path;
  const related = await getRelatedProducts(product, 10);
  const discount = discountPercent(variant.price, variant.compareAtPrice);
  const line = detailCartLine(product, variant);
  const favorite = detailFavorite(product);
  const attributes = attributeRows(variant);
  const seller = currentOffer(product, variant)?.seller ?? null;
  const base = siteUrl();
  const productUrl = `${base}/produit/${product.slug}`;

  // Données structurées pour Google (rich snippets prix / disponibilité)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    image: product.images.map((i) => `${base}${i}`),
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
    offers: product.variants.map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      priceCurrency: "XAF",
      price: v.price,
      availability: v.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url:
        product.variants.length > 1
          ? `${productUrl}?variante=${encodeURIComponent(v.sku)}`
          : productUrl,
    })),
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

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1fr_1fr] xl:grid-cols-[1.25fr_1fr_20rem]">
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
          <div className="mt-3 flex flex-wrap gap-2">
            <FavoriteButton item={favorite} variant="inline" />
            <ShareButtons url={productUrl} title={product.title} price={product.price} />
          </div>

          <div className="border-ink-100 my-4 border-y py-4">
            <div className="flex items-start gap-3">
              <Price
                price={variant.price}
                oldPrice={variant.compareAtPrice}
                size="lg"
                showSavings
              />
              {discount && <DiscountSticker percent={discount} className="mt-1 text-lg" />}
            </div>
            <p className="text-ink-500 mt-1 text-xs">Prix en francs CFA, toutes taxes comprises</p>
            <VariantPicker
              slug={product.slug}
              variants={product.variants}
              selectedId={variant.id}
            />
          </div>

          <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
            {product.brand && (
              <>
                <dt className="text-ink-500">Marque</dt>
                <dd className="font-medium">{product.brand}</dd>
              </>
            )}
            {attributes.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-ink-500">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
            {seller && (
              <>
                <dt className="text-ink-500">Vendu par</dt>
                <dd className="font-medium">
                  {seller.name} ({seller.city})
                </dd>
              </>
            )}
            <dt className="text-ink-500">Rayon</dt>
            <dd className="font-medium">{path.at(-1)?.name}</dd>
            <dt className="text-ink-500">Référence</dt>
            <dd className="font-medium">{variant.sku}</dd>
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

      <OtherSellers product={product} variant={variant} />

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
                ...attributes,
                ["Catégorie", path.map((c) => c.name).join(" › ")],
                ["Référence", variant.sku],
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
      <StickyBuyBar line={line} oldPrice={variant.compareAtPrice} />
    </div>
  );
}
