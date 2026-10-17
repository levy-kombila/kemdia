import type { ZoneId } from "@kemdia/contracts/delivery";
import type { DescribedLine, ReservedVariant } from "../../catalog/index.js";
import type { Cart, CartLine } from "../domain/cart.js";
import type { DeliveryAddress } from "../domain/delivery-address.js";
import type { Coupon, CouponRules } from "../domain/coupon.js";
import type { CancelReason, OrderStatus, PaymentMethod, PricedLine } from "../domain/order.js";
import type { NewShopPart, ShopPart, ShopPartStatus, VendorView } from "../domain/shop-part.js";

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

// --- Commandes (S5-T02, ADR-0024) ---

/** Commande enregistrée, telle que le module la relit. */
export interface OrderRecord {
  id: string;
  reference: string;
  accountId: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentPhone: string | null;
  subtotal: number;
  /** Réduction du coupon (S5-T03) : total = articles − réduction + livraison */
  discount: number;
  couponCode: string | null;
  deliveryFee: number;
  total: number;
  delivery: DeliveryAddress & { daysMin: number; daysMax: number };
  lines: PricedLine[];
  createdAt: Date;
  paymentDueAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: CancelReason | null;
  /** Paiement reçu (S5-T04) : la commande ne s'annule plus en ligne */
  paidAt: Date | null;
  history: { status: OrderStatus; at: Date }[];
  /** Empreinte de la demande (adresse, paiement, total) : une même clé ne sert qu'à une même commande */
  requestHash: string;
  /** Une part par boutique (S6-T07, BR-013) */
  shopParts: ShopPart[];
}

export type NewOrder = Omit<
  OrderRecord,
  | "id"
  | "reference"
  | "createdAt"
  | "cancelledAt"
  | "cancelReason"
  | "history"
  | "paidAt"
  | "shopParts"
> & {
  idempotencyKey: string;
  /** Parts par boutique ; ouvertes tout de suite si la commande naît confirmée (paiement à la livraison) */
  shopParts: (NewShopPart & { openedAt: Date | null; dueAt: Date | null })[];
};

export interface OrderSummaryRecord {
  id: string;
  reference: string;
  status: OrderStatus;
  total: number;
  itemCount: number;
  image: string | null;
  createdAt: Date;
}

/** Position dans « Mes commandes » (date de création puis identifiant, du plus récent au plus ancien). */
export interface OrderCursor {
  createdAt: Date;
  id: string;
}

export interface OrderRepository {
  /** Verrouille le panier du compte jusqu'à la fin de la transaction et renvoie ses lignes (`null` : pas de panier). */
  lockCart(accountId: string): Promise<{ cartId: string; lines: CartLine[] } | null>;
  findByIdempotencyKey(accountId: string, key: string): Promise<OrderRecord | null>;
  /** Commandes du compte qui bloquent encore du stock (en attente de paiement, confirmées, en préparation). */
  countOpen(accountId: string): Promise<number>;
  /** Enregistre la commande, ses lignes et son premier statut ; tire des numéros jusqu'à en trouver un libre. */
  insert(order: NewOrder, now: Date, nextReference: () => string): Promise<OrderRecord>;
  /** Retire du panier les variantes commandées. */
  removeCartLines(cartId: string, variantIds: readonly string[]): Promise<void>;
  /** Commande du compte (`null` : de n'importe quel compte, administration) ; `lock` : verrouillée jusqu'à la fin de la transaction. */
  findByReference(
    accountId: string | null,
    reference: string,
    lock?: boolean,
  ): Promise<OrderRecord | null>;
  list(
    accountId: string,
    limit: number,
    before?: OrderCursor,
  ): Promise<{ items: OrderSummaryRecord[]; next: OrderCursor | null }>;
  /** Change le statut et l'inscrit dans l'historique. */
  setStatus(orderId: string, status: OrderStatus, now: Date, reason?: CancelReason): Promise<void>;
  /** Note le paiement reçu (une seule fois ; la base refuse ensuite tout changement). */
  markPaid(orderId: string, now: Date): Promise<void>;
  /** Commandes en attente de paiement dont l'échéance est passée (pour l'annulation automatique). */
  findOverdue(now: Date, limit: number): Promise<string[]>;
  /**
   * Verrouille une commande par son identifiant ; `null` si absente ou (sans `wait`) déjà verrouillée par une autre
   * tâche. `wait` : attend le verrou (borné par lock_timeout).
   */
  lockById(orderId: string, wait?: boolean): Promise<OrderRecord | null>;

  // --- Commandes des vendeurs (S6-T07, ADR-0038) ---

  /** Commande confirmée : ouvre ses parts de vendeurs encore fermées (délai de 24 h, e-mail à envoyer). */
  openShopParts(orderId: string, now: Date): Promise<number>;
  /** Décision d'une part EN ATTENTE (commande verrouillée par l'appelant) ; `false` si elle n'attendait plus. */
  decideShopPart(
    orderId: string,
    shopId: string,
    decision:
      | { status: "accepted"; by: string }
      | { status: "refused"; by: string; reason: string }
      | { status: "expired" },
    now: Date,
  ): Promise<boolean>;
  /** Commandes confirmées dont une part de vendeur a dépassé son échéance sans réponse. */
  findVendorOverdue(now: Date, limit: number): Promise<string[]>;
  /** Commandes de la boutique (parts ouvertes), de la plus récente à la plus ancienne. */
  listForShop(
    shopId: string,
    query: { view?: VendorView | undefined; limit: number; before?: VendorOrderCursor | undefined },
  ): Promise<{ items: VendorOrderSummaryRecord[]; next: VendorOrderCursor | null }>;
  /** Commande de la boutique (part ouverte), avec SES lignes seulement ; `lock` : commande verrouillée. */
  findForShop(shopId: string, reference: string, lock?: boolean): Promise<VendorOrderRecord | null>;
  /** E-mails « nouvelle commande » dont c'est l'heure (parts ouvertes, pas encore envoyés). */
  findDueVendorEmails(now: Date, limit: number): Promise<VendorEmailRecord[]>;
  /** Réserve un envoi : un essai de plus, prochain essai repoussé ; `false` si déjà pris ou envoyé. */
  claimVendorEmail(orderId: string, shopId: string, now: Date, nextAt: Date): Promise<boolean>;
  markVendorEmailSent(orderId: string, shopId: string, now: Date): Promise<void>;
  /** Abandonne l'envoi (commande plus à traiter, vendeur sans adresse vérifiée, 5 essais). */
  giveUpVendorEmail(orderId: string, shopId: string): Promise<void>;
}
export const ORDER_REPOSITORY = Symbol("ORDER_REPOSITORY");

/** Position dans les commandes d'une boutique (ouverture puis commande, de la plus récente à la plus ancienne). */
export interface VendorOrderCursor {
  openedAt: Date;
  orderId: string;
}

/** Une commande vue par une boutique : SES articles, la ville de livraison, rien d'autre du client. */
export interface VendorOrderSummaryRecord {
  orderId: string;
  reference: string;
  orderStatus: OrderStatus;
  cityName: string;
  part: ShopPart & { openedAt: Date; dueAt: Date };
}

export interface VendorOrderRecord extends VendorOrderSummaryRecord {
  /** Articles de la boutique seulement */
  lines: PricedLine[];
}

/** E-mail « nouvelle commande » à envoyer à une boutique. */
export interface VendorEmailRecord {
  orderId: string;
  shopId: string;
  reference: string;
  orderStatus: OrderStatus;
  partStatus: ShopPartStatus;
  subtotal: number;
  itemCount: number;
  dueAt: Date;
  emailAttempts: number;
}

/** Transaction partagée (commande, stock du catalogue, panier) ; attente des verrous bornée. */
export interface OrdersTransaction {
  run<T>(work: () => Promise<T>): Promise<T>;
}
export const ORDERS_TRANSACTION = Symbol("ORDERS_TRANSACTION");

/** Stock du catalogue (port public `StockService`), utilisé dans la transaction de la commande. */
export interface OrderStock {
  reserve(lines: readonly CartLine[]): Promise<ReservedVariant[]>;
  release(lines: readonly CartLine[]): Promise<void>;
}
export const ORDER_STOCK = Symbol("ORDER_STOCK");

/** Tirage au hasard (numéro de commande), remplaçable dans les tests. */
export const ORDER_RANDOM = Symbol("ORDER_RANDOM");
export type RandomBytes = (size: number) => Uint8Array;

// --- Paiement à la livraison (S5-T04, ADR-0026) ---

/** Réglage du paiement à la livraison (BR-011) : zones et total maximum, modifiés par un administrateur. */
export interface CodSettingsRecord {
  zones: ZoneId[];
  maxTotal: number;
  updatedAt: Date | null;
}

export interface CodSettingsRepository {
  get(): Promise<CodSettingsRecord>;
  save(
    settings: { zones: ZoneId[]; maxTotal: number },
    adminId: string,
    now: Date,
  ): Promise<CodSettingsRecord>;
}
export const COD_SETTINGS_REPOSITORY = Symbol("COD_SETTINGS_REPOSITORY");

// --- Coupons (S5-T03, ADR-0025) ---

/** Position dans la liste des coupons (date de création puis identifiant). */
export interface CouponCursor {
  createdAt: Date;
  id: string;
}

export interface CouponRepository {
  findByCode(code: string): Promise<Coupon | null>;
  findById(id: string): Promise<Coupon | null>;
  /** Verrouille le coupon jusqu'à la fin de la transaction (compteur et utilisations par compte relus sous verrou). */
  lockByCode(code: string): Promise<Coupon | null>;
  /** Utilisations de ce coupon par ce compte, commandes annulées non comptées. */
  countUses(couponId: string, accountId: string): Promise<number>;
  /** Compte une utilisation et l'attache à la commande (même transaction que la commande). */
  redeem(use: {
    couponId: string;
    orderId: string;
    accountId: string;
    amount: number;
    now: Date;
  }): Promise<void>;
  /** Commande annulée : l'utilisation est rendue (compteur −1) ; sans effet si la commande n'avait pas de coupon. */
  releaseForOrder(orderId: string, now: Date): Promise<void>;
  /** Crée le coupon ; `null` si le code existe déjà. */
  create(rules: CouponRules, createdBy: string, now: Date): Promise<Coupon | null>;
  setActive(id: string, active: boolean, now: Date): Promise<Coupon | null>;
  list(
    limit: number,
    before?: CouponCursor,
  ): Promise<{ items: Coupon[]; next: CouponCursor | null }>;
}
export const COUPON_REPOSITORY = Symbol("COUPON_REPOSITORY");

/**
 * Mobile Money peut-il aboutir sur cet environnement (S5-T07, ADR-0029) ? Même règle que le choix du fournisseur dans
 * le module payments (`config/mobile-money.ts`) : sans fournisseur, le devis ne propose pas Mobile Money et une
 * commande Mobile Money est refusée (elle ne pourrait jamais être payée et bloquerait le stock 30 minutes).
 */
export interface MobileMoneyAvailability {
  readonly available: boolean;
}
export const MOBILE_MONEY = Symbol("MOBILE_MONEY");
