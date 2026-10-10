import type { DescribedLine } from "../../catalog/index.js";
import type { Cart, CartLine } from "../domain/cart.js";

/** Panier enregistré (schéma PostgreSQL `orders`). */
export interface CartRepository {
  /**
   * Lignes du panier du compte, dans l'ordre d'ajout ; vide s'il n'a pas de panier.
   * Note l'activité (au plus une fois par heure) : un panier consulté n'est pas supprimé par le ménage.
   */
  read(accountId: string, now: Date): Promise<CartLine[]>;
  /**
   * En UNE transaction : crée le panier s'il n'existe pas, le **verrouille** (deux demandes simultanées du même compte
   * passent l'une après l'autre), applique `change`, puis enregistre ce qui a changé. Si `change` lève une erreur,
   * rien n'est enregistré.
   */
  update<T>(
    accountId: string,
    now: Date,
    change: (cart: Cart) => T,
  ): Promise<{ lines: CartLine[]; result: T }>;
  /**
   * Comme `update`, pour la réunion après connexion, **idempotente** : si `mergeId` est la dernière réunion appliquée à ce
   * panier, rien ne change (`result: null`). Sinon `change` s'applique et `mergeId` est retenu, dans la même transaction.
   */
  merge<T>(
    accountId: string,
    now: Date,
    mergeId: string,
    change: (cart: Cart) => T,
  ): Promise<MergeOutcome<T>>;
  /** Retire des variantes qui n'existent plus dans le catalogue. */
  removeVariants(accountId: string, variantIds: readonly string[]): Promise<void>;
  /** Ménage : supprime les paniers sans activité depuis `before`. Renvoie le nombre supprimé. */
  purgeInactive(before: Date): Promise<number>;
}
export const CART_REPOSITORY = Symbol("CART_REPOSITORY");

/** Résultat d'une réunion : `result` vide si cette réunion avait déjà été appliquée. */
export interface MergeOutcome<T> {
  lines: CartLine[];
  result: T | null;
}

/** Ce que le panier demande au catalogue (port public du module catalog : `CatalogService`). */
export interface CartCatalog {
  describeLines(lines: readonly CartLine[]): Promise<DescribedLine[]>;
}
export const CART_CATALOG = Symbol("CART_CATALOG");
