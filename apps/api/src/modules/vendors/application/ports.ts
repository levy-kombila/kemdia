import type { Shop, ShopStatus } from "../domain/shop.js";

/** Ports dont les cas d'utilisation des boutiques ont besoin (implémentés dans `infrastructure/`). */

export const SHOP_REPOSITORY = Symbol("SHOP_REPOSITORY");
export const VENDORS_TRANSACTION = Symbol("VENDORS_TRANSACTION");
export const VENDORS_RANDOM = Symbol("VENDORS_RANDOM");

/** Position dans la file des boutiques (ordre : demande la plus ancienne d'abord). */
export interface ShopCursor {
  submittedAt: Date;
  id: string;
}

export interface ShopRepository {
  findById(id: string): Promise<Shop | null>;
  findByOwner(accountId: string): Promise<Shop | null>;
  /** Lit la boutique et la verrouille jusqu'à la fin de la transaction (décisions concurrentes). */
  lockById(id: string): Promise<Shop | null>;
  /**
   * Sérialise les demandes d'un même compte jusqu'à la fin de la transaction (deux envois simultanés du formulaire ne
   * créent jamais deux boutiques, même quand aucune ligne n'existe encore à verrouiller).
   */
  lockOwner(accountId: string): Promise<void>;
  /**
   * Boutique du compte, verrouillée en partage jusqu'à la fin de la transaction (S6-T02) : une suspension attend la fin
   * de l'écriture du vendeur, et le vendeur n'écrit jamais pour une boutique suspendue entre-temps.
   */
  shareLockByOwner(accountId: string): Promise<Shop | null>;
  /** Une AUTRE boutique que `exceptId` a-t-elle cette clé de nom ? */
  isNameTaken(nameKey: string, exceptId?: string): Promise<boolean>;
  /** Une AUTRE boutique que `exceptId` a-t-elle cette adresse ? */
  isSlugTaken(slug: string, exceptId?: string): Promise<boolean>;
  /** `false` : un nom ou une adresse déjà pris entre-temps (index unique). */
  insert(shop: Shop, now: Date): Promise<boolean>;
  /** `false` : un nom ou une adresse déjà pris entre-temps (index unique). */
  update(shop: Shop, now: Date): Promise<boolean>;
  list(query: {
    status?: ShopStatus | undefined;
    limit: number;
    after?: ShopCursor | undefined;
  }): Promise<{ items: Shop[]; next: ShopCursor | null }>;
}

/** Produits d'une boutique dans le catalogue : cachés à la suspension, montrés à la réactivation (S6-T02). */
export const SHOP_LISTING = Symbol("SHOP_LISTING");
export interface ShopListing {
  setShopSuspended(shopId: string, suspended: boolean): Promise<number>;
}

/** Transaction de la base, partagée avec le module identity (rôle) et le journal d'audit. */
export interface VendorsTransaction {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export interface VendorsRandom {
  uuid(): string;
  /** 4 caractères [a-z0-9] pour départager deux adresses de boutique identiques. */
  slugSuffix(): string;
}

// --- E-mail « nouvelle commande » au vendeur (S6-T07, ADR-0038) ---

/** Ce que l'e-mail dit d'une commande : jamais le nom, le téléphone ni l'adresse du client. */
export interface NewOrderNotice {
  firstName: string;
  shopName: string;
  reference: string;
  itemCount: number;
  subtotal: number;
  dueAt: Date;
}

export const VENDOR_ORDER_MAILER = Symbol("VENDOR_ORDER_MAILER");
export interface VendorOrderMailer {
  /** `false` : aucun envoi d'e-mail configuré (les e-mails attendent) */
  readonly available: boolean;
  send(to: string, notice: NewOrderNotice): Promise<void>;
}
