import type {
  Category,
  CategoryNode,
  Facets,
  ProductDetail,
  ProductPage,
  ProductSummary,
} from "@kemdia/contracts";

/**
 * Fausse API pour les tests du site (S3-T08, remplace le mode fichier) : un petit catalogue en mémoire
 * et un `fetch` qui répond comme `/api/v1`. Les vraies règles de recherche sont testées dans l'API
 * (tests d'intégration) et de bout en bout ; ici, on teste ce que le SITE fait des réponses.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const category = (n: number, slug: string, name: string, parent: number | null): Category => ({
  id: id(n),
  slug,
  name,
  parentId: parent === null ? null : id(parent),
  icon: "tag",
  image: null,
});

/** Deux grands rayons, chacun avec une sous-catégorie. */
export const FAKE_CATEGORIES: readonly Category[] = [
  category(1, "high-tech", "High-Tech", null),
  category(2, "telephones", "Téléphones", 1),
  category(3, "mode", "Mode", null),
  category(4, "chaussures", "Chaussures", 3),
];

const product = (
  n: number,
  categoryN: number,
  extra: Partial<ProductSummary> = {},
): ProductSummary => ({
  id: id(100 + n),
  slug: `produit-${n}`,
  title: `Produit ${n}`,
  brand: n % 2 ? "Apple" : "Samsung",
  categoryId: id(categoryN),
  image: `/images/products/produit-${n}.webp`,
  price: 10_000 * n,
  compareAtPrice: null,
  inStock: true,
  variantId: id(200 + n),
  stock: 5,
  variantCount: 1,
  offerCount: 1,
  rating: 4,
  reviewCount: 10 * n,
  isFeatured: false,
  isBestseller: false,
  isNew: false,
  ...extra,
});

/** 5 téléphones (rayon High-Tech) et 4 chaussures (rayon Mode). */
export const FAKE_PRODUCTS: readonly ProductSummary[] = [
  product(1, 2, { isBestseller: true }),
  product(2, 2, { isFeatured: true, compareAtPrice: 30_000 }),
  product(3, 2, { isNew: true }),
  product(4, 2),
  product(5, 2),
  product(6, 4, { isBestseller: true }),
  product(7, 4),
  product(8, 4),
  product(9, 4),
];

const children = (parent: string | null): CategoryNode[] =>
  FAKE_CATEGORIES.filter((c) => c.parentId === parent).map((c) => ({
    ...c,
    children: children(c.id),
  }));

/** La catégorie et ses descendantes. */
const subtree = (slug: string): Set<string> => {
  const root = FAKE_CATEGORIES.find((c) => c.slug === slug);
  const ids = new Set<string>();
  const visit = (catId: string) => {
    ids.add(catId);
    FAKE_CATEGORIES.filter((c) => c.parentId === catId).forEach((c) => visit(c.id));
  };
  if (root) visit(root.id);
  return ids;
};

function detail(p: ProductSummary): ProductDetail {
  const cat = FAKE_CATEGORIES.find((c) => c.id === p.categoryId) ?? null;
  const parent = FAKE_CATEGORIES.find((c) => c.id === cat?.parentId);
  return {
    ...p,
    description: "Produit de test",
    category: cat,
    path: [parent, cat].filter((c): c is Category => Boolean(c)),
    images: p.image ? [p.image] : [],
    totalStock: p.stock,
    variants: [
      {
        id: p.variantId,
        sku: `SKU-${p.slug}`,
        name: "Standard",
        attributes: {},
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        stock: p.stock,
        available: true,
      },
    ],
    offers: [
      {
        offerId: p.id,
        seller: { name: "Kemdia", slug: "kemdia", city: "Libreville" },
        isMain: true,
        variants: [
          {
            variantId: p.variantId,
            listingVariantId: p.variantId,
            name: "Standard",
            price: p.price,
            compareAtPrice: p.compareAtPrice,
            stock: p.stock,
            available: true,
          },
        ],
      },
    ],
  };
}

function products(params: URLSearchParams): ProductPage {
  let items = [...FAKE_PRODUCTS];
  const cat = params.get("category");
  if (cat) {
    const ids = subtree(cat);
    items = items.filter((p) => ids.has(p.categoryId));
  }
  const badge = params.get("badge");
  if (badge === "bestseller") items = items.filter((p) => p.isBestseller);
  if (badge === "featured") items = items.filter((p) => p.isFeatured);
  if (badge === "new") items = items.filter((p) => p.isNew);
  if (params.get("scope") === "promotions") items = items.filter((p) => p.compareAtPrice !== null);
  const pageSize = Number(params.get("pageSize") ?? 24);
  const page = Number(params.get("page") ?? 1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: items.length,
    totalPages,
  };
}

const FACETS: Facets = {
  brands: [{ name: "Apple", count: 5 }],
  prices: [{ key: "moins-50000", count: 4 }],
  inStock: 9,
  deals: 1,
  rating4: 9,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Réponse de la fausse API à une adresse `…/api/v1/…`. */
export function fakeApiResponse(input: string): Response {
  const url = new URL(input);
  const path = url.pathname.replace(/^\/api\/v1/, "");
  if (path === "/categories") return json({ items: children(null) });
  const catMatch = /^\/categories\/([\w-]+)$/.exec(path);
  if (catMatch) {
    const cat = FAKE_CATEGORIES.find((c) => c.slug === catMatch[1]);
    if (!cat) return json({ status: 404 }, 404);
    const parent = FAKE_CATEGORIES.find((c) => c.id === cat.parentId);
    return json({
      category: cat,
      path: [parent, cat].filter(Boolean),
      children: FAKE_CATEGORIES.filter((c) => c.parentId === cat.id),
    });
  }
  if (path === "/products") return json(products(url.searchParams));
  if (path === "/products/facets") return json(FACETS);
  const prodMatch = /^\/products\/([\w-]+)$/.exec(path);
  if (prodMatch) {
    const found = FAKE_PRODUCTS.find((p) => p.slug === prodMatch[1]);
    return found ? json(detail(found)) : json({ status: 404 }, 404);
  }
  return json({ status: 404 }, 404);
}
