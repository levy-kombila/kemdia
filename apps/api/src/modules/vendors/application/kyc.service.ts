import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import {
  checkDocument,
  decideKyc,
  editKyc,
  submitKyc,
  validateKyc,
  type KycDetails,
  type KycDocumentKind,
  type KycFile,
  type KycStatus,
} from "../domain/kyc.js";
import type { Shop } from "../domain/shop.js";
import { VendorsError } from "../domain/vendors-error.js";
import {
  KYC_BOX,
  KYC_IMAGE_PROCESSOR,
  KYC_REPOSITORY,
  SHOP_REPOSITORY,
  VENDORS_RANDOM,
  VENDORS_TRANSACTION,
  type KycBox,
  type KycCursor,
  type KycImageProcessor,
  type KycRepository,
  type KycSummary,
  type ShopRepository,
  type VendorsRandom,
  type VendorsTransaction,
} from "./ports.js";

export type KycInput = Parameters<typeof validateKyc>[0];
/** Dossier vu par un administrateur : numéros complets, déchiffrés. */
export type AdminKycView = KycFile & { shopName: string; idNumber: string; payoutAccount: string };

const AUDIT_DETAIL_MAX = 100;
const notFound = () => new VendorsError("KYC_INTROUVABLE", "pas encore de dossier de vérification");
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const context = (shopId: string, field: string) => `${shopId.toLowerCase()}:${field}`;

/**
 * Vérification des vendeurs, KYC (S6-T08, ADR-0039 ; BR-024).
 *
 * - Vendeur (boutique ACTIVE, relue sous verrou partagé comme pour ses produits) : remplit son dossier, envoie les
 *   photos demandées, l'envoie à l'équipe. Il ne revoit jamais ses numéros ni ses photos : seulement les 4 derniers
 *   caractères et la liste des photos reçues.
 * - Administrateur (double authentification confirmée) : file des dossiers ENVOYÉS, dossier avec numéros complets et
 *   photos (chaque consultation au journal d'audit), validation ou refus (motif). Jamais sur sa propre boutique.
 * - Numéros et photos chiffrés (clé KYC_ENCRYPTION_KEY) ; sans clé, tout est fermé (`KYC_INDISPONIBLE`).
 * - Photos effacées 30 jours après la décision (tâche planifiée).
 */
@Injectable()
export class KycService {
  clock: () => Date = () => new Date();

  constructor(
    @Inject(KYC_REPOSITORY) private readonly files: KycRepository,
    @Inject(SHOP_REPOSITORY) private readonly shops: ShopRepository,
    @Inject(KYC_BOX) private readonly box: KycBox,
    @Inject(KYC_IMAGE_PROCESSOR) private readonly images: KycImageProcessor,
    @Inject(VENDORS_TRANSACTION) private readonly tx: VendorsTransaction,
    @Inject(VENDORS_RANDOM) private readonly random: VendorsRandom,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
  ) {}

  // --- Vendeur ---

  async mine(accountId: string): Promise<KycFile> {
    this.requireBox();
    const shop = await this.shops.findByOwner(accountId);
    if (!shop || shop.status !== "active") throw inactive(shop);
    const file = await this.files.find(shop.id);
    if (!file) throw notFound();
    return file;
  }

  /** Crée ou modifie le dossier (numéros chiffrés) : il repasse « en préparation ». */
  async save(accountId: string, input: KycInput, ctx: AuditContext): Promise<KycFile> {
    this.requireBox();
    const details = validateKyc(input);
    return this.tx.run(async () => {
      const shop = await this.activeShop(accountId);
      const existing = await this.files.lock(shop.id);
      const next = editKyc(existing, shop.id, details);
      const now = this.clock();
      await this.files.save(next, now, this.seal(shop.id, details));
      await this.audit.record({
        action: "kyc.updated",
        actor: { type: "account", id: accountId },
        target: { type: "shop", id: shop.id },
        details: {
          idType: next.idType,
          payoutMethod: next.payoutMethod,
          holderKind: next.holderKind,
        },
        context: ctx,
      });
      return next;
    });
  }

  /** Ajoute ou remplace une photo : réencodée (hors transaction, c'est long), puis chiffrée. */
  async addDocument(
    accountId: string,
    kind: KycDocumentKind,
    bytes: Uint8Array,
    ctx: AuditContext,
  ): Promise<KycFile> {
    this.requireBox();
    // Droits et état vérifiés AVANT le réencodage coûteux, puis de nouveau dans la transaction
    await this.editableFile(accountId, kind);
    const webp = await this.images.process(bytes);
    return this.tx.run(async () => {
      const { shop, file } = await this.editableFile(accountId, kind, true);
      const uploadedAt = await this.files.putDocument(
        shop.id,
        kind,
        this.random.uuid(),
        this.box.seal(webp, context(shop.id, kind)),
      );
      const next: KycFile = {
        ...file,
        // Un dossier refusé que l'on corrige repasse « en préparation »
        ...(file.status === "rejected"
          ? {
              status: "draft" as const,
              reviewedBy: null,
              reviewedAt: null,
              rejectionReason: null,
              documentsPurgeAt: null,
            }
          : {}),
        documents: [...file.documents.filter((d) => d.kind !== kind), { kind, uploadedAt }].sort(
          (a, b) => a.kind.localeCompare(b.kind),
        ),
      };
      if (next.status !== file.status) await this.files.save(next, this.clock());
      await this.audit.record({
        action: "kyc.document_added",
        actor: { type: "account", id: accountId },
        target: { type: "shop", id: shop.id },
        details: { kind },
        context: ctx,
      });
      return next;
    });
  }

  /** Envoi à l'équipe : toutes les photos demandées doivent être là. */
  async submit(accountId: string, ctx: AuditContext): Promise<KycFile> {
    this.requireBox();
    return this.tx.run(async () => {
      const shop = await this.activeShop(accountId);
      const file = await this.files.lock(shop.id);
      if (!file) throw notFound();
      const next = submitKyc(file, this.clock());
      await this.files.save(next, this.clock());
      await this.audit.record({
        action: "kyc.submitted",
        actor: { type: "account", id: accountId },
        target: { type: "shop", id: shop.id },
        details: {},
        context: ctx,
      });
      return next;
    });
  }

  // --- Administrateur ---

  list(query: {
    status?: Exclude<KycStatus, "draft"> | undefined;
    limit: number;
    after?: KycCursor | undefined;
  }): Promise<{ items: KycSummary[]; next: KycCursor | null }> {
    this.requireBox();
    return this.files.list(query);
  }

  /** Dossier complet (numéros déchiffrés) : consultation inscrite au journal d'audit. */
  async get(adminId: string, shopId: string, ctx: AuditContext): Promise<AdminKycView> {
    this.requireBox();
    return this.tx.run(async () => {
      const shop = await this.shops.findById(shopId);
      const file = shop ? await this.files.find(shop.id) : null;
      // Un brouillon reste chez le vendeur : l'équipe ne voit que les dossiers envoyés
      if (!shop || !file || file.status === "draft") throw notFound();
      if (shop.ownerAccountId === adminId) throw ownShop();
      const secrets = await this.files.readSecrets(shop.id);
      if (!secrets) throw notFound();
      await this.audit.record({
        action: "kyc.viewed",
        actor: { type: "account", id: adminId },
        target: { type: "shop", id: shop.id },
        details: {},
        context: ctx,
      });
      return {
        ...file,
        shopName: shop.name,
        idNumber: decoder.decode(this.box.open(secrets.idNumber, context(shop.id, "id_number"))),
        payoutAccount: decoder.decode(
          this.box.open(secrets.payoutAccount, context(shop.id, "payout_account")),
        ),
      };
    });
  }

  /** Photo déchiffrée (WebP), consultation inscrite au journal d'audit. */
  async document(
    adminId: string,
    shopId: string,
    kind: KycDocumentKind,
    ctx: AuditContext,
  ): Promise<Uint8Array> {
    this.requireBox();
    return this.tx.run(async () => {
      const shop = await this.shops.findById(shopId);
      const file = shop ? await this.files.find(shop.id) : null;
      if (!shop || !file || file.status === "draft") throw notFound();
      if (shop.ownerAccountId === adminId) throw ownShop();
      const box = await this.files.readDocument(file.shopId, kind);
      if (!box) {
        throw new VendorsError(
          "DOCUMENT_INTROUVABLE",
          "photo absente (jamais envoyée, ou effacée 30 jours après la décision)",
        );
      }
      await this.audit.record({
        action: "kyc.document_viewed",
        actor: { type: "account", id: adminId },
        target: { type: "shop", id: file.shopId },
        details: { kind },
        context: ctx,
      });
      return this.box.open(box, context(file.shopId, kind));
    });
  }

  async decide(
    adminId: string,
    shopId: string,
    decision: "approve" | "reject",
    reason: string | null,
    ctx: AuditContext,
  ): Promise<KycFile> {
    this.requireBox();
    return this.tx.run(async () => {
      const shop = await this.shops.findById(shopId);
      if (!shop) throw notFound();
      if (shop.ownerAccountId === adminId) throw ownShop();
      const file = await this.files.lock(shop.id);
      if (!file || file.status === "draft") throw notFound();
      const now = this.clock();
      const next = decideKyc(file, decision, { adminId, reason, now });
      await this.files.save(next, now);
      await this.audit.record({
        action: decision === "approve" ? "kyc.approved" : "kyc.rejected",
        actor: { type: "account", id: adminId },
        target: { type: "shop", id: shop.id },
        details: next.rejectionReason ? { reason: short(next.rejectionReason) } : {},
        context: ctx,
      });
      return next;
    });
  }

  /** Tâche planifiée : photos des dossiers décidés depuis 30 jours effacées. */
  purge(): Promise<number> {
    return this.tx.run(() => this.files.purgeDocuments(this.clock()));
  }

  // --- Outils ---

  private requireBox(): void {
    if (!this.box.available) {
      throw new VendorsError(
        "KYC_INDISPONIBLE",
        "vérification des vendeurs indisponible pour le moment",
      );
    }
  }

  private async activeShop(accountId: string): Promise<Shop> {
    const shop = await this.shops.shareLockByOwner(accountId);
    if (!shop || shop.status !== "active") throw inactive(shop);
    return shop;
  }

  private async editableFile(
    accountId: string,
    kind: KycDocumentKind,
    locked = false,
  ): Promise<{ shop: Shop; file: KycFile }> {
    const shop = locked
      ? await this.activeShop(accountId)
      : await this.shops.findByOwner(accountId);
    if (!shop || shop.status !== "active") throw inactive(shop);
    const file = locked ? await this.files.lock(shop.id) : await this.files.find(shop.id);
    if (!file) throw notFound();
    checkDocument(file, kind);
    return { shop, file };
  }

  private seal(shopId: string, details: KycDetails) {
    return {
      idNumber: this.box.seal(encoder.encode(details.idNumber), context(shopId, "id_number")),
      payoutAccount: this.box.seal(
        encoder.encode(details.payoutAccount),
        context(shopId, "payout_account"),
      ),
    };
  }
}

/** Personne n'examine son propre dossier : ni décision, ni consultation (relecture S6-T08). */
const ownShop = () =>
  new VendorsError(
    "BOUTIQUE_SUR_SOI_INTERDITE",
    "vous ne pouvez pas examiner votre propre boutique",
  );

function inactive(shop: Shop | null): VendorsError {
  return shop
    ? new VendorsError("BOUTIQUE_INACTIVE", "votre boutique n'est pas active")
    : new VendorsError("BOUTIQUE_INTROUVABLE", "vous n'avez pas de boutique");
}

function short(reason: string): string {
  return reason.length <= AUDIT_DETAIL_MAX ? reason : `${reason.slice(0, AUDIT_DETAIL_MAX - 1)}…`;
}
