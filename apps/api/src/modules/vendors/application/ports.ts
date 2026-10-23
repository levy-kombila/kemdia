import type { KycDocumentKind, KycFile, KycHolderKind, KycStatus } from "../domain/kyc.js";
import type { Shop, ShopStatus } from "../domain/shop.js";

/** Ports dont les cas d'utilisation des boutiques ont besoin (implémentés dans `infrastructure/`). */

export const SHOP_REPOSITORY = Symbol("SHOP_REPOSITORY");
export const VENDORS_TRANSACTION = Symbol("VENDORS_TRANSACTION");
/** Avis des clients d'une fiche fusionnée (module reviews, S8-T01). */
export const LISTING_REVIEWS = Symbol("LISTING_REVIEWS");
export const VENDORS_RANDOM = Symbol("VENDORS_RANDOM");

/** Position dans la file des boutiques (ordre : demande la plus ancienne d'abord). */
export interface ShopCursor {
  submittedAt: Date;
  id: string;
}

export interface ShopRepository {
  findById(id: string): Promise<Shop | null>;
  findByOwner(accountId: string): Promise<Shop | null>;
  /** Boutique par son adresse (import du catalogue, S8-T03). */
  findBySlug(slug: string): Promise<Shop | null>;
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
export interface SellerProfile {
  name: string;
  slug: string;
  city: string;
  neighborhood: string | null;
  description: string;
  official: boolean;
  active: boolean;
  since: Date;
}

export interface ShopListing {
  setShopSuspended(shopId: string, suspended: boolean): Promise<number>;
  /**
   * Copie publique de la boutique dans le catalogue : à côté de ses offres (S7.5-T02) et sur sa page publique
   * (S7.5-T07). La date `since` n'est retenue qu'à la création de la copie (première validation).
   */
  syncSeller(shopId: string, seller: SellerProfile): Promise<void>;
}

/** Transaction de la base, partagée avec le module identity (rôle) et le journal d'audit. */
export interface VendorsTransaction {
  /** `timeoutMs` : durée maximale de la transaction (10 s par défaut ; l'import du catalogue en demande plus). */
  run<T>(work: () => Promise<T>, options?: { timeoutMs?: number }): Promise<T>;
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

// --- Vérification des vendeurs, KYC (S6-T08, ADR-0039) ---

export const KYC_REPOSITORY = Symbol("KYC_REPOSITORY");
export const KYC_BOX = Symbol("KYC_BOX");
export const KYC_IMAGE_PROCESSOR = Symbol("KYC_IMAGE_PROCESSOR");

/** Numéros sensibles, chiffrés (boîtes AES-256-GCM). */
export interface KycSecrets {
  idNumber: Uint8Array;
  payoutAccount: Uint8Array;
}

/** Ligne de la file de l'équipe. */
export interface KycSummary {
  shopId: string;
  shopName: string;
  status: KycStatus;
  holderKind: KycHolderKind;
  submittedAt: Date;
  reviewedAt: Date | null;
}

/** Position dans la file (envoi le plus ancien d'abord). */
export interface KycCursor {
  submittedAt: Date;
  shopId: string;
}

export interface KycRepository {
  find(shopId: string): Promise<KycFile | null>;
  /** Lit le dossier et le verrouille jusqu'à la fin de la transaction. */
  lock(shopId: string): Promise<KycFile | null>;
  /**
   * Enregistre le dossier. `secrets` : nouveaux numéros chiffrés (création ou modification par le vendeur) ; absent :
   * seuls statut, dates et motif changent. Les photos qui ne sont plus dans `file.documents` sont effacées.
   */
  save(file: KycFile, now: Date, secrets?: KycSecrets): Promise<void>;
  readSecrets(shopId: string): Promise<KycSecrets | null>;
  /** Ajoute ou remplace la photo de cette sorte. */
  putDocument(shopId: string, kind: KycDocumentKind, id: string, box: Uint8Array): Promise<Date>;
  readDocument(shopId: string, kind: KycDocumentKind): Promise<Uint8Array | null>;
  /** File de l'équipe : dossiers ENVOYÉS seulement (un brouillon reste chez le vendeur). */
  list(query: {
    status?: Exclude<KycStatus, "draft"> | undefined;
    limit: number;
    after?: KycCursor | undefined;
  }): Promise<{ items: KycSummary[]; next: KycCursor | null }>;
  /** Efface les photos des dossiers décidés depuis 30 jours ; renvoie le nombre de photos effacées. */
  purgeDocuments(now: Date): Promise<number>;
}

/** Chiffrement des numéros et des photos (clé KYC_ENCRYPTION_KEY). `context` est lié à la boîte (données associées). */
export interface KycBox {
  readonly available: boolean;
  seal(plain: Uint8Array, context: string): Uint8Array;
  open(box: Uint8Array, context: string): Uint8Array;
}

/** Photo de pièce : format vérifié, réencodée en WebP sans métadonnées (ni EXIF ni position GPS). */
export interface KycImageProcessor {
  process(bytes: Uint8Array): Promise<Uint8Array>;
}

/** Fusion de fiches : les avis de la fiche fusionnée rejoignent la cible, notes recalculées (S8-T01). */
export interface ListingReviews {
  moveReviews(sourceId: string, targetId: string): Promise<void>;
}
