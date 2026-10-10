import { OrdersError } from "./orders-error.js";

/**
 * Panier serveur d'un compte (S5-T01, ADR-0023) — TypeScript pur, sans base ni framework.
 *
 * Le panier ne garde que des **variantes et des quantités** : jamais de prix (BR-004, ils sont relus dans le
 * catalogue à chaque lecture). Il n'est **pas une réservation** : le stock n'est réservé qu'à la création de la
 * commande, dans la même transaction (BR-012, S5-T02). Le stock connu ici sert seulement à borner les quantités.
 */

/** Lignes au plus (même valeur que `CART_MAX_LINES` du contrat et que le déclencheur SQL). */
export const MAX_CART_LINES = 50;
/** Quantité au plus par ligne (même valeur que `CART_MAX_QUANTITY` du contrat et que la contrainte SQL). */
export const MAX_LINE_QUANTITY = 20;
/** Un panier sans activité depuis ce nombre de jours est supprimé (`CART_TTL_DAYS` du contrat). */
export const CART_TTL_DAYS = 90;

export interface CartLine {
  variantId: string;
  quantity: number;
}

/**
 * Stock commandable d'une variante au moment de l'opération : `null` si la variante n'existe pas (ou plus),
 * 0 si le produit n'est plus en vente (BR-001).
 */
export type StockOf = (variantId: string) => number | null;

function assertQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    throw new RangeError(`quantité : entier de 1 à ${MAX_LINE_QUANTITY}`);
  }
}

/** Quantité retenue : demandée, mais jamais plus que le stock ni que le maximum par ligne. */
function bounded(quantity: number, stock: number): number {
  return Math.min(quantity, stock, MAX_LINE_QUANTITY);
}

export class Cart {
  /** Ordre d'insertion conservé : les lignes s'affichent dans l'ordre où elles ont été ajoutées. */
  private readonly lines: Map<string, number>;

  private constructor(lines: readonly CartLine[]) {
    this.lines = new Map(lines.map((l) => [l.variantId, l.quantity]));
  }

  static empty(): Cart {
    return new Cart([]);
  }

  /** Panier relu en base (déjà validé par les contraintes SQL). */
  static restore(lines: readonly CartLine[]): Cart {
    return new Cart(lines);
  }

  get items(): CartLine[] {
    return [...this.lines].map(([variantId, quantity]) => ({ variantId, quantity }));
  }

  get size(): number {
    return this.lines.size;
  }

  quantityOf(variantId: string): number {
    return this.lines.get(variantId) ?? 0;
  }

  /**
   * Ajoute une variante. Déjà présente : les quantités s'additionnent. Le total est ramené au stock et au
   * maximum par ligne (comme le panier du navigateur). BR-001 : variante inconnue ou sans stock → refus.
   */
  add(variantId: string, quantity: number, stockOf: StockOf): void {
    assertQuantity(quantity);
    const stock = this.sellableStock(variantId, stockOf);
    this.put(variantId, bounded(this.quantityOf(variantId) + quantity, stock));
  }

  /** Fixe la quantité d'une ligne (la crée si besoin), ramenée au stock disponible. */
  setQuantity(variantId: string, quantity: number, stockOf: StockOf): void {
    assertQuantity(quantity);
    const stock = this.sellableStock(variantId, stockOf);
    this.put(variantId, bounded(quantity, stock));
  }

  /** Retire une ligne ; sans effet si elle n'y est pas. */
  remove(variantId: string): void {
    this.lines.delete(variantId);
  }

  clear(): void {
    this.lines.clear();
  }

  /**
   * Réunit le panier du navigateur avec celui du compte, juste après la connexion (choix du 2026-10-10) :
   * même variante → quantités **additionnées** (bornées au stock et au maximum par ligne) ; nouvelle variante →
   * ajoutée à la fin. Rien n'échoue : une ligne indisponible ou qui ne tient plus (panier plein) est ignorée et comptée.
   * Une variante présente plusieurs fois dans la demande n'est reprise qu'une fois.
   */
  merge(incoming: readonly CartLine[], stockOf: StockOf): { ignored: number } {
    let ignored = 0;
    const seen = new Set<string>();
    for (const line of incoming) {
      if (seen.has(line.variantId)) {
        ignored++;
        continue;
      }
      seen.add(line.variantId);
      assertQuantity(line.quantity);
      const stock = stockOf(line.variantId);
      const present = this.lines.has(line.variantId);
      if (stock === null || stock <= 0 || (!present && this.lines.size >= MAX_CART_LINES)) {
        ignored++;
        continue;
      }
      this.lines.set(
        line.variantId,
        bounded(this.quantityOf(line.variantId) + line.quantity, stock),
      );
    }
    return { ignored };
  }

  private sellableStock(variantId: string, stockOf: StockOf): number {
    const stock = stockOf(variantId);
    if (stock === null) throw new OrdersError("VARIANTE_INCONNUE", "ce produit n'existe pas");
    if (stock <= 0) {
      throw new OrdersError(
        "PRODUIT_INDISPONIBLE",
        "ce produit n'est plus disponible pour le moment",
      );
    }
    return stock;
  }

  private put(variantId: string, quantity: number): void {
    if (!this.lines.has(variantId) && this.lines.size >= MAX_CART_LINES) {
      throw new OrdersError(
        "PANIER_PLEIN",
        `votre panier contient déjà ${MAX_CART_LINES} produits différents : retirez-en un pour ajouter celui-ci`,
      );
    }
    this.lines.set(variantId, quantity);
  }
}
