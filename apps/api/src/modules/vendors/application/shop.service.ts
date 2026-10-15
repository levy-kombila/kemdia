import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditAction, type AuditContext } from "../../audit/index.js";
import { IdentityError, RoleService, type Role } from "../../identity/index.js";
import {
  decide,
  newShop,
  resubmit,
  validateApplication,
  type Shop,
  type ShopDecision,
  type ShopStatus,
} from "../domain/shop.js";
import { VendorsError } from "../domain/vendors-error.js";
import {
  SHOP_REPOSITORY,
  VENDORS_RANDOM,
  VENDORS_TRANSACTION,
  type ShopCursor,
  type ShopRepository,
  type VendorsRandom,
  type VendorsTransaction,
} from "./ports.js";

/** L'administrateur qui décide, tel que la session l'a authentifié (rôles relus à chaque requête). */
export interface ShopActor {
  accountId: string;
  roles: readonly Role[];
}

export interface ShopApplicationInput {
  name: string;
  city: string;
  phone: string;
  description: string;
}

const AUDIT_ACTION: Record<ShopDecision, AuditAction> = {
  approve: "shop.approved",
  reject: "shop.rejected",
  suspend: "shop.suspended",
};

/** Longueur maximale d'un détail du journal d'audit (MAX_DETAIL_LENGTH du module audit). */
const AUDIT_DETAIL_MAX = 100;

/** Motif sur une ligne, coupé à la taille d'un détail du journal. */
function shortReason(reason: string): string {
  const line = reason.replace(/\s+/g, " ");
  return line.length <= AUDIT_DETAIL_MAX ? line : `${line.slice(0, AUDIT_DETAIL_MAX - 1)}…`;
}

/** Essais d'adresse lisible avec un suffixe avant d'abandonner (en pratique, le premier suffit). */
const SLUG_ATTEMPTS = 5;

const notFound = () => new VendorsError("BOUTIQUE_INTROUVABLE", "boutique introuvable");
const nameTaken = () =>
  new VendorsError(
    "NOM_BOUTIQUE_PRIS",
    "une autre boutique porte déjà ce nom : choisissez-en un autre",
  );

/**
 * Boutiques des vendeurs (S6-T01, ADR-0032).
 *
 * - Un client connecté demande à ouvrir SA boutique (une par compte) ; elle attend la décision d'un administrateur.
 *   Après un refus, il peut redemander avec d'autres informations.
 * - Un administrateur valide (le compte reçoit le rôle `vendor`), refuse (avec un motif) ou suspend (le rôle est
 *   retiré). Boutique, rôle et ligne du journal d'audit changent dans UNE transaction : tout ou rien.
 */
@Injectable()
export class ShopService {
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    @Inject(SHOP_REPOSITORY) private readonly shops: ShopRepository,
    @Inject(VENDORS_TRANSACTION) private readonly tx: VendorsTransaction,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(RoleService) private readonly roles: Pick<RoleService, "grant" | "revoke">,
    @Inject(VENDORS_RANDOM) private readonly random: VendorsRandom,
  ) {}

  /** Demande d'ouverture (ou nouvelle demande après un refus) par le compte connecté. */
  async apply(
    accountId: string,
    input: ShopApplicationInput,
    context: AuditContext,
  ): Promise<Shop> {
    const application = validateApplication(input);
    const now = this.clock();
    return this.tx.run(async () => {
      await this.shops.lockOwner(accountId);
      const existing = await this.shops.findByOwner(accountId);
      if (existing && existing.status !== "rejected") {
        throw new VendorsError("BOUTIQUE_EXISTE", "vous avez déjà une boutique");
      }
      if (await this.shops.isNameTaken(application.nameKey, existing?.id)) throw nameTaken();
      const slug = await this.freeSlug(application.slugBase, existing);
      const shop = existing
        ? resubmit(existing, application, slug, now)
        : newShop(this.random.uuid(), accountId, slug, application, now);
      const saved = existing
        ? await this.shops.update(shop, now)
        : await this.shops.insert(shop, now);
      if (!saved) throw nameTaken();
      // Trace de chaque demande : une boutique refusée sous un nom puis redemandée sous un autre reste visible
      await this.audit.record({
        action: "shop.requested",
        actor: { type: "account", id: accountId },
        target: { type: "shop", id: shop.id },
        details: existing ? { name: shop.name, previousName: existing.name } : { name: shop.name },
        context,
      });
      return shop;
    });
  }

  /** La boutique du compte connecté. */
  async mine(accountId: string): Promise<Shop> {
    const shop = await this.shops.findByOwner(accountId);
    if (!shop) throw notFound();
    return shop;
  }

  async get(shopId: string): Promise<Shop> {
    const shop = await this.shops.findById(shopId);
    if (!shop) throw notFound();
    return shop;
  }

  list(query: {
    status?: ShopStatus | undefined;
    limit: number;
    after?: ShopCursor | undefined;
  }): Promise<{ items: Shop[]; next: ShopCursor | null }> {
    return this.shops.list(query);
  }

  /** Valider, refuser ou suspendre (administrateur). */
  async decide(
    actor: ShopActor,
    shopId: string,
    decision: ShopDecision,
    reason: string | null,
    context: AuditContext,
  ): Promise<Shop> {
    return this.tx.run(async () => {
      const shop = await this.shops.lockById(shopId);
      if (!shop) throw notFound();
      const now = this.clock();
      const next = decide(shop, decision, { adminId: actor.accountId, reason, now });
      // Le rôle d'abord : un compte fermé entre-temps fait échouer toute la décision (rien n'est écrit)
      if (decision !== "reject") await this.changeVendorRole(actor, shop, decision, context);
      if (!(await this.shops.update(next, now))) throw nameTaken();
      await this.audit.record({
        action: AUDIT_ACTION[decision],
        actor: { type: "account", id: actor.accountId },
        target: { type: "shop", id: shop.id },
        details: {
          name: shop.name,
          from: shop.status,
          to: next.status,
          // Le motif est aussi gardé ici : sur la boutique, il est remplacé par la décision ou la demande suivante
          ...(next.statusReason ? { reason: shortReason(next.statusReason) } : {}),
        },
        context,
      });
      return next;
    });
  }

  private async changeVendorRole(
    actor: ShopActor,
    shop: Shop,
    decision: "approve" | "suspend",
    context: AuditContext,
  ): Promise<void> {
    const owner = shop.ownerAccountId!;
    const roleActor = { accountId: actor.accountId, roles: actor.roles };
    try {
      if (decision === "approve") await this.roles.grant(roleActor, owner, "vendor", context);
      else await this.roles.revoke(roleActor, owner, "vendor", context);
    } catch (error) {
      if (error instanceof IdentityError) {
        if (error.code === "COMPTE_INACTIF" || error.code === "COMPTE_INTROUVABLE") {
          throw new VendorsError(
            "PROPRIETAIRE_INACTIF",
            "le compte du vendeur est fermé ou n'existe plus : la boutique ne peut pas être validée",
          );
        }
        if (error.code === "ROLE_SUR_SOI_INTERDIT") {
          throw new VendorsError(
            "BOUTIQUE_SUR_SOI_INTERDITE",
            "vous ne pouvez pas décider pour votre propre boutique",
          );
        }
      }
      throw error;
    }
  }

  /** Adresse lisible libre : la base tirée du nom, sinon la base suivie d'un suffixe au hasard. */
  private async freeSlug(base: string, existing: Shop | null): Promise<string> {
    if (existing?.slug === base) return base;
    if (!(await this.shops.isSlugTaken(base, existing?.id))) return base;
    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
      const candidate = `${base}-${this.random.slugSuffix()}`;
      if (!(await this.shops.isSlugTaken(candidate, existing?.id))) return candidate;
    }
    throw nameTaken();
  }
}
