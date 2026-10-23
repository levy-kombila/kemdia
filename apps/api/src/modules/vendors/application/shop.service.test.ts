import { describe, expect, it } from "vitest";
import type { AuditEntry } from "../../audit/index.js";
import { IdentityError } from "../../identity/index.js";
import type { Shop } from "../domain/shop.js";
import type { ShopCursor, ShopRepository, VendorsTransaction } from "./ports.js";
import { ShopService, type ShopActor } from "./shop.service.js";

const AWA = "11111111-1111-4111-8111-111111111111";
const BOB = "44444444-4444-4444-8444-444444444444";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const CTX = { ip: "203.0.113.7", requestId: "req-1" };
const admin: ShopActor = { accountId: ADMIN, roles: ["client", "admin"] };

const APPLICATION = {
  name: "Chez Ali",
  city: "Libreville",
  neighborhood: null,
  phone: "077 12 34 56",
  description: "Téléphones et accessoires d'origine, garantis six mois.",
};

/** Dépôt en mémoire : mêmes règles d'unicité que la base (propriétaire, clé de nom, adresse). */
class InMemoryShops implements ShopRepository {
  rows = new Map<string, Shop>();
  locks: string[] = [];
  findById = (id: string) => Promise.resolve(this.copy(this.rows.get(id)));
  findByOwner = (accountId: string) =>
    Promise.resolve(this.copy([...this.rows.values()].find((s) => s.ownerAccountId === accountId)));
  lockById = (id: string) => this.findById(id);
  shareLockByOwner = (accountId: string) => this.findByOwner(accountId);
  lockOwner = (accountId: string) => {
    this.locks.push(accountId);
    return Promise.resolve();
  };
  isNameTaken = (nameKey: string, exceptId?: string) =>
    Promise.resolve(
      [...this.rows.values()].some((s) => s.nameKey === nameKey && s.id !== exceptId),
    );
  isSlugTaken = (slug: string, exceptId?: string) =>
    Promise.resolve([...this.rows.values()].some((s) => s.slug === slug && s.id !== exceptId));
  insert = (shop: Shop) => {
    this.rows.set(shop.id, { ...shop });
    return Promise.resolve(true);
  };
  update = (shop: Shop) => {
    if (!this.rows.has(shop.id)) return Promise.resolve(false);
    this.rows.set(shop.id, { ...shop });
    return Promise.resolve(true);
  };
  list = (query: { limit: number; after?: ShopCursor | undefined }) =>
    Promise.resolve({ items: [...this.rows.values()].slice(0, query.limit), next: null });
  private copy(shop: Shop | undefined): Shop | null {
    return shop ? { ...shop } : null;
  }
}

/** Transaction en mémoire : en cas d'erreur, les boutiques reviennent à leur état d'avant (tout ou rien). */
class Rollback implements VendorsTransaction {
  constructor(private readonly shops: InMemoryShops) {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    const before = new Map([...this.shops.rows].map(([id, shop]) => [id, { ...shop }]));
    try {
      return await work();
    } catch (error) {
      this.shops.rows = before;
      throw error;
    }
  }
}

function setup(options: { roleError?: IdentityError } = {}) {
  const shops = new InMemoryShops();
  const audit: AuditEntry[] = [];
  const roleCalls: string[] = [];
  const listing: string[] = [];
  let ids = 0;
  let suffixes = 0;
  const service = new ShopService(
    shops,
    new Rollback(shops),
    { record: (entry: AuditEntry) => Promise.resolve(void audit.push(entry)) },
    {
      grant: (_actor, target, role) => {
        if (options.roleError) return Promise.reject(options.roleError);
        roleCalls.push(`grant ${role} ${target}`);
        return Promise.resolve({} as never);
      },
      revoke: (_actor, target, role) => {
        roleCalls.push(`revoke ${role} ${target}`);
        return Promise.resolve({} as never);
      },
    },
    {
      uuid: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
      slugSuffix: () => ["ab12", "cd34", "ef56"][suffixes++ % 3]!,
    },
    {
      setShopSuspended: (shopId: string, suspended: boolean) => {
        listing.push(`${suspended ? "cacher" : "montrer"} ${shopId}`);
        return Promise.resolve(0);
      },
      syncSeller: (shopId: string, seller: { name: string; city: string }) => {
        listing.push(`vendeur ${shopId} ${seller.name} (${seller.city})`);
        return Promise.resolve();
      },
    },
  );
  service.clock = () => new Date("2026-10-15T20:00:00.000Z");
  return { service, shops, audit, roleCalls, listing };
}

const codeOf = async (promise: Promise<unknown>) =>
  promise.then(
    () => "aucune erreur",
    (error: { code?: string }) => error.code,
  );

describe("ShopService : demande de boutique (S6-T01)", () => {
  it("enregistre une demande en attente, sous le verrou du compte", async () => {
    const { service, shops } = setup();
    const shop = await service.apply(AWA, APPLICATION, CTX);
    expect(shop).toMatchObject({
      ownerAccountId: AWA,
      status: "pending",
      slug: "chez-ali",
      contactPhone: "+241077123456",
    });
    expect(shops.locks).toEqual([AWA]);
    expect(await service.mine(AWA)).toEqual(shop);
  });

  it("une seule boutique par compte, et un nom ne sert qu'une fois", async () => {
    const { service } = setup();
    await service.apply(AWA, APPLICATION, CTX);
    expect(await codeOf(service.apply(AWA, { ...APPLICATION, name: "Autre nom" }, CTX))).toBe(
      "BOUTIQUE_EXISTE",
    );
    expect(await codeOf(service.apply(BOB, { ...APPLICATION, name: "CHEZ ALI !" }, CTX))).toBe(
      "NOM_BOUTIQUE_PRIS",
    );
  });

  it("départage deux adresses identiques par un suffixe", async () => {
    const { service, shops } = setup();
    // Une boutique existante occupe déjà l'adresse « mode-241 » sous une autre clé de nom
    // (cas réel : deux noms très longs coupés au même endroit)
    const first = await service.apply(AWA, { ...APPLICATION, name: "Mode 241" }, CTX);
    shops.rows.get(first.id)!.nameKey = "mode 241 et accessoires";
    const second = await service.apply(BOB, { ...APPLICATION, name: "Mode 241" }, CTX);
    expect(second.slug).toBe("mode-241-ab12");
  });

  it("après un refus, une nouvelle demande repart en attente", async () => {
    const { service } = setup();
    const shop = await service.apply(AWA, APPLICATION, CTX);
    await service.decide(admin, shop.id, "reject", "Description trop vague", CTX);
    expect(await service.mine(AWA)).toMatchObject({
      status: "rejected",
      statusReason: "Description trop vague",
    });
    const again = await service.apply(AWA, { ...APPLICATION, name: "Chez Ali Mobile" }, CTX);
    expect(again).toMatchObject({
      id: shop.id,
      status: "pending",
      statusReason: null,
      slug: "chez-ali-mobile",
    });
  });

  it("une demande invalide n'écrit rien", async () => {
    const { service, shops } = setup();
    expect(await codeOf(service.apply(AWA, { ...APPLICATION, phone: "123" }, CTX))).toBe(
      "BOUTIQUE_INVALIDE",
    );
    expect(shops.rows.size).toBe(0);
    expect(await codeOf(service.mine(AWA))).toBe("BOUTIQUE_INTROUVABLE");
  });
});

describe("ShopService : décisions de l'administration (S6-T01)", () => {
  it("valider accorde le rôle vendeur et écrit le journal", async () => {
    const { service, audit, roleCalls } = setup();
    const shop = await service.apply(AWA, APPLICATION, CTX);
    const approved = await service.decide(admin, shop.id, "approve", null, CTX);
    expect(approved).toMatchObject({ status: "active", reviewedBy: ADMIN });
    expect(roleCalls).toEqual([`grant vendor ${AWA}`]);
    expect(audit).toEqual([
      {
        action: "shop.requested",
        actor: { type: "account", id: AWA },
        target: { type: "shop", id: shop.id },
        details: { name: "Chez Ali" },
        context: CTX,
      },
      {
        action: "shop.approved",
        actor: { type: "account", id: ADMIN },
        target: { type: "shop", id: shop.id },
        details: { name: "Chez Ali", from: "pending", to: "active" },
        context: CTX,
      },
    ]);
  });

  it("suspendre retire le rôle ; réactiver le rend", async () => {
    const { service, roleCalls, audit, listing } = setup();
    const shop = await service.apply(AWA, APPLICATION, CTX);
    await service.decide(admin, shop.id, "approve", null, CTX);
    await service.decide(admin, shop.id, "suspend", "Contrefaçons signalées", CTX);
    await service.decide(admin, shop.id, "approve", null, CTX);
    // S6-T02 : les produits de la boutique sont cachés à la suspension, montrés à la réactivation
    // S7.5-T02 : nom et ville copiés pour le catalogue à chaque décision (validée, suspendue, réactivée)
    const seller = `vendeur ${shop.id} Chez Ali (Libreville)`;
    expect(listing).toEqual([
      `montrer ${shop.id}`,
      seller,
      `cacher ${shop.id}`,
      seller,
      `montrer ${shop.id}`,
      seller,
    ]);
    expect(roleCalls).toEqual([
      `grant vendor ${AWA}`,
      `revoke vendor ${AWA}`,
      `grant vendor ${AWA}`,
    ]);
    expect(audit.map((entry) => entry.action)).toEqual([
      "shop.requested",
      "shop.approved",
      "shop.suspended",
      "shop.approved",
    ]);
    // Le motif est gardé au journal (sur la boutique, la décision suivante l'efface)
    expect(audit[2]?.details).toEqual({
      name: "Chez Ali",
      from: "active",
      to: "suspended",
      reason: "Contrefaçons signalées",
    });
  });

  it("une nouvelle demande garde l'ancien nom au journal ; un long motif est coupé à 100 caractères", async () => {
    const { service, audit } = setup();
    const shop = await service.apply(AWA, APPLICATION, CTX);
    await service.decide(admin, shop.id, "reject", `Motif ${"x".repeat(200)}`, CTX);
    expect(String(audit[1]?.details.reason)).toHaveLength(100);
    await service.apply(AWA, { ...APPLICATION, name: "Chez Ali Mobile" }, CTX);
    expect(audit[2]).toMatchObject({
      action: "shop.requested",
      details: { name: "Chez Ali Mobile", previousName: "Chez Ali" },
    });
  });

  it("refuser ne touche à aucun rôle", async () => {
    const { service, roleCalls } = setup();
    const shop = await service.apply(AWA, APPLICATION, CTX);
    await service.decide(admin, shop.id, "reject", "Pièces manquantes", CTX);
    expect(roleCalls).toEqual([]);
  });

  it("compte du vendeur fermé : rien n'est écrit (ni boutique, ni journal)", async () => {
    const { service, shops, audit } = setup({
      roleError: new IdentityError("COMPTE_INACTIF", "inactif"),
    });
    const shop = await service.apply(AWA, APPLICATION, CTX);
    expect(await codeOf(service.decide(admin, shop.id, "approve", null, CTX))).toBe(
      "PROPRIETAIRE_INACTIF",
    );
    expect(shops.rows.get(shop.id)?.status).toBe("pending");
    expect(audit.map((entry) => entry.action)).toEqual(["shop.requested"]);
  });

  it("personne ne décide pour sa propre boutique", async () => {
    const { service } = setup();
    const shop = await service.apply(ADMIN, APPLICATION, CTX);
    expect(await codeOf(service.decide(admin, shop.id, "approve", null, CTX))).toBe(
      "BOUTIQUE_SUR_SOI_INTERDITE",
    );
  });

  it("boutique inconnue ou décision hors de l'état prévu", async () => {
    const { service } = setup();
    expect(
      await codeOf(
        service.decide(admin, "99999999-9999-4999-8999-999999999999", "approve", null, CTX),
      ),
    ).toBe("BOUTIQUE_INTROUVABLE");
    const shop = await service.apply(AWA, APPLICATION, CTX);
    expect(await codeOf(service.decide(admin, shop.id, "suspend", "Motif valable", CTX))).toBe(
      "STATUT_BOUTIQUE_INCOMPATIBLE",
    );
  });
});

describe("ShopService : ville, quartier et « Ma boutique » (S7.5-T07)", () => {
  it("ville et quartier des listes officielles ; « Autre quartier » = non précisé", async () => {
    const { service } = setup();
    expect(await codeOf(service.apply(AWA, { ...APPLICATION, city: "Ville inventée" }, CTX))).toBe(
      "BOUTIQUE_INVALIDE",
    );
    expect(
      await codeOf(
        service.apply(AWA, { ...APPLICATION, city: "Libreville", neighborhood: "Nulle part" }, CTX),
      ),
    ).toBe("BOUTIQUE_INVALIDE");
    const shop = await service.apply(
      AWA,
      { ...APPLICATION, city: "Libreville", neighborhood: "Akébé" },
      CTX,
    );
    expect(shop).toMatchObject({ city: "Libreville", neighborhood: "Akébé" });
    const other = await service.apply(
      BOB,
      { ...APPLICATION, name: "Chez Bob", city: "Oyem", neighborhood: "Autre quartier" },
      CTX,
    );
    expect(other.neighborhood).toBeNull();
  });

  it("le vendeur change ville, quartier et description ; copie publique et journal à jour", async () => {
    const { service, audit, listing } = setup();
    const shop = await service.apply(AWA, APPLICATION, CTX);
    // En attente : modifiable, mais pas encore de copie publique
    await service.updateProfile(
      AWA,
      {
        city: "Libreville",
        neighborhood: "Akébé",
        description: "Pagnes, wax et tissus de qualité",
      },
      CTX,
    );
    expect(listing).toEqual([]);
    await service.decide(admin, shop.id, "approve", null, CTX);
    listing.length = 0;
    const updated = await service.updateProfile(
      AWA,
      {
        city: "Port-Gentil",
        neighborhood: "Mandji",
        description: "Pagnes, wax et tissus de qualité",
      },
      CTX,
    );
    expect(updated).toMatchObject({
      city: "Port-Gentil",
      neighborhood: "Mandji",
      name: "Chez Ali",
    });
    expect(listing).toEqual([`vendeur ${shop.id} Chez Ali (Port-Gentil)`]);
    expect(audit.at(-1)).toMatchObject({
      action: "shop.profile_updated",
      actor: { type: "account", id: AWA },
      details: {
        city: "Port-Gentil",
        neighborhood: "Mandji",
        previousCity: "Libreville",
        descriptionChanged: "non",
      },
    });
  });

  it("refusé pour une boutique refusée ou inconnue, et pour une description trop courte", async () => {
    const { service } = setup();
    const profile = { city: "Libreville", description: "Pagnes, wax et tissus de qualité" };
    expect(await codeOf(service.updateProfile(AWA, profile, CTX))).toBe("BOUTIQUE_INTROUVABLE");
    const shop = await service.apply(AWA, APPLICATION, CTX);
    expect(
      await codeOf(service.updateProfile(AWA, { ...profile, description: "Court" }, CTX)),
    ).toBe("BOUTIQUE_INVALIDE");
    await service.decide(admin, shop.id, "reject", "Pièces manquantes", CTX);
    expect(await codeOf(service.updateProfile(AWA, profile, CTX))).toBe(
      "STATUT_BOUTIQUE_INCOMPATIBLE",
    );
  });
});
