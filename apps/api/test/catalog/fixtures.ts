import type { ProductProps, VariantProps } from "../../src/modules/catalog/domain/product.js";

/** Données de test valides, à modifier champ par champ dans chaque cas. */
export const ids = {
  product: "0b9f1c7e-3f5a-4b8e-9c2d-1a2b3c4d5e6f",
  category: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  v1: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
  v2: "3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b",
};

export const variantProps = (overrides: Partial<VariantProps> = {}): VariantProps => ({
  id: ids.v1,
  sku: "KMD-TEL-NOIR",
  name: "Noir",
  attributes: { couleur: "Noir" },
  price: 150_000,
  compareAtPrice: null,
  stock: 5,
  isActive: true,
  ...overrides,
});

export const productProps = (overrides: Partial<ProductProps> = {}): ProductProps => ({
  id: ids.product,
  slug: "telephone-kemdia",
  title: "Téléphone Kemdia",
  description: "Un téléphone.",
  brand: "Kemdia",
  categoryId: ids.category,
  images: ["/images/products/telephone.webp"],
  status: "PUBLISHED",
  rating: 4.3,
  reviewCount: 12,
  isFeatured: false,
  isBestseller: false,
  isNew: true,
  variants: [variantProps()],
  ...overrides,
});
