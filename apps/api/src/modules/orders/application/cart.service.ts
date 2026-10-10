import { Inject, Injectable } from "@nestjs/common";
import type { DescribedLine } from "../../catalog/index.js";
import { MAX_LINE_QUANTITY, type CartLine, type StockOf } from "../domain/cart.js";
import { CART_CATALOG, CART_REPOSITORY, type CartCatalog, type CartRepository } from "./ports.js";

/** Ligne du panier telle que l'API la renvoie : informations ACTUELLES du catalogue (BR-001, BR-004). */
export interface CartLineView {
  variantId: string;
  productId: string;
  slug: string;
  title: string;
  variantName: string;
  image: string | null;
  price: number;
  compareAtPrice: number | null;
  quantity: number;
  /** Quantité qu'on peut demander maintenant : stock disponible, limité au maximum par ligne. */
  maxQuantity: number;
  ok: boolean;
  reason?: "PRODUIT_INDISPONIBLE" | "VARIANTE_INCONNUE" | "QUANTITE_INVALIDE" | "STOCK_INSUFFISANT";
  available?: number;
}

export interface CartView {
  lines: CartLineView[];
  itemCount: number;
  /** Total des lignes commandables, en FCFA, calculé ici (jamais reçu du navigateur : BR-004). */
  subtotal: number;
  /** Panier non vide et entièrement commandable : on peut passer en caisse. */
  ok: boolean;
}

/**
 * Panier serveur du compte connecté (S5-T01, ADR-0023).
 *
 * - Chaque lecture **revérifie** le panier dans le catalogue : prix actuel, stock, produit encore en vente (BR-001, BR-004).
 *   C'est cette vérification qui sert au passage en caisse.
 * - Chaque modification est faite sous verrou, en une transaction (voir `CartRepository.update`).
 * - Le stock lu avant la modification ne sert qu'à borner les quantités : le panier ne réserve rien (BR-012 au S5-T02).
 */
@Injectable()
export class CartService {
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    @Inject(CART_REPOSITORY) private readonly carts: CartRepository,
    @Inject(CART_CATALOG) private readonly catalog: CartCatalog,
  ) {}

  async view(accountId: string): Promise<CartView> {
    return this.present(accountId, await this.carts.read(accountId, this.clock()));
  }

  async add(accountId: string, rawVariantId: string, quantity: number): Promise<CartView> {
    const variantId = normalized(rawVariantId);
    const stockOf = await this.stocks([variantId]);
    const { lines } = await this.carts.update(accountId, this.clock(), (cart) =>
      cart.add(variantId, quantity, stockOf),
    );
    return this.present(accountId, lines);
  }

  async setQuantity(accountId: string, rawVariantId: string, quantity: number): Promise<CartView> {
    const variantId = normalized(rawVariantId);
    const stockOf = await this.stocks([variantId]);
    const { lines } = await this.carts.update(accountId, this.clock(), (cart) =>
      cart.setQuantity(variantId, quantity, stockOf),
    );
    return this.present(accountId, lines);
  }

  async remove(accountId: string, rawVariantId: string): Promise<CartView> {
    const variantId = normalized(rawVariantId);
    const { lines } = await this.carts.update(accountId, this.clock(), (cart) =>
      cart.remove(variantId),
    );
    return this.present(accountId, lines);
  }

  async clear(accountId: string): Promise<CartView> {
    await this.carts.update(accountId, this.clock(), (cart) => cart.clear());
    return this.present(accountId, []);
  }

  /**
   * Après la connexion : le panier du navigateur rejoint celui du compte (quantités additionnées).
   * `mergeId` (tiré par le navigateur) rend la réunion idempotente : renvoyée deux fois, elle ne double rien.
   */
  async merge(
    accountId: string,
    rawMergeId: string,
    received: readonly CartLine[],
  ): Promise<CartView & { ignored: number }> {
    const mergeId = normalized(rawMergeId);
    const incoming = received.map((l) => ({
      variantId: normalized(l.variantId),
      quantity: l.quantity,
    }));
    if (incoming.length === 0) return { ...(await this.view(accountId)), ignored: 0 };
    const stockOf = await this.stocks(incoming.map((l) => l.variantId));
    const { lines, result } = await this.carts.merge(accountId, this.clock(), mergeId, (cart) =>
      cart.merge(incoming, stockOf),
    );
    return { ...(await this.present(accountId, lines)), ignored: result?.ignored ?? 0 };
  }

  /** Ménage des paniers abandonnés (appelé par la tâche horaire). */
  purgeInactive(before: Date): Promise<number> {
    return this.carts.purgeInactive(before);
  }

  /** Stock commandable de quelques variantes, lu dans le catalogue (`null` = variante inconnue). */
  private async stocks(variantIds: readonly string[]): Promise<StockOf> {
    const unique = [...new Set(variantIds)];
    const described = await this.catalog.describeLines(
      unique.map((variantId) => ({ variantId, quantity: 1 })),
    );
    const stock = new Map(described.map((d) => [d.variantId, d.variant ? d.variant.stock : null]));
    return (variantId) => stock.get(variantId) ?? null;
  }

  private async present(accountId: string, lines: readonly CartLine[]): Promise<CartView> {
    const described = lines.length ? await this.catalog.describeLines(lines) : [];
    // Variante supprimée du catalogue : rien à afficher ni à commander, on la retire du panier
    const gone = described.filter((d) => !d.variant).map((d) => d.variantId);
    if (gone.length) await this.carts.removeVariants(accountId, gone);
    const views = described.flatMap((d) => (d.variant ? [lineView(d, d.variant)] : []));
    return {
      lines: views,
      itemCount: views.reduce((n, l) => n + l.quantity, 0),
      subtotal: views.reduce((sum, l) => (l.ok ? sum + l.price * l.quantity : sum), 0),
      ok: views.length > 0 && views.every((l) => l.ok),
    };
  }
}

/**
 * Un UUID s'écrit en minuscules ou en majuscules : PostgreSQL les confond, le code non. Tout est ramené en minuscules
 * à l'entrée, pour qu'une même variante ne fasse jamais deux lignes (leçon de la relecture du S4-T06).
 */
function normalized(variantId: string): string {
  return variantId.toLowerCase();
}

function lineView(d: DescribedLine, v: NonNullable<DescribedLine["variant"]>): CartLineView {
  return {
    variantId: d.variantId,
    productId: v.productId,
    slug: v.slug,
    title: v.title,
    variantName: v.variantName,
    image: v.image,
    price: v.price,
    compareAtPrice: v.compareAtPrice,
    quantity: d.quantity,
    maxQuantity: Math.min(v.stock, MAX_LINE_QUANTITY),
    ok: d.ok,
    ...(d.ok ? {} : { reason: d.reason }),
    ...(!d.ok && d.available !== undefined ? { available: d.available } : {}),
  };
}
