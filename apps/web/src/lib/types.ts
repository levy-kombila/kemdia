/**
 * Types du domaine Kemdia (côté frontend).
 * Ils reflètent le contrat qui sera exposé par l'API backend (Sprint 3+).
 */

export type Category = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  /** Nom d'icône (convention Font Awesome héritée, résolue par <CategoryIcon/>) */
  icon: string;
  image: string | null;
};

export type CategoryNode = Category & { children: CategoryNode[] };

export type Product = {
  id: string;
  slug: string;
  title: string;
  description: string;
  /** Prix en FCFA (XAF), entier — pas de centimes en FCFA */
  price: number;
  oldPrice: number | null;
  brand: string | null;
  categoryId: string;
  images: string[];
  stock: number;
  rating: number;
  reviewCount: number;
  isFeatured: boolean;
  isBestseller: boolean;
  isNew: boolean;
  color: string | null;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
