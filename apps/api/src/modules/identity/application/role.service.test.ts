import { describe, expect, it } from "vitest";
import {
  FakeClock,
  InMemoryAccounts,
  InMemoryRoles,
  RecordingAudit,
  directTransactions,
} from "../../../../test/identity/in-memory.js";
import { Account, type AccountStatus } from "../domain/account.js";
import { requireIdentifier } from "../domain/identifier.js";
import type { StoredRole } from "../domain/role.js";
import { RoleService } from "./role.service.js";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const AWA_ID = "22222222-2222-4222-8222-222222222222";
const CTX = { ip: "203.0.113.5", requestId: "req-7" };

async function setup() {
  const accounts = new InMemoryAccounts();
  const roles = new InMemoryRoles(accounts);
  const audit = new RecordingAudit();
  const clock = new FakeClock();
  const service = new RoleService(accounts, roles, clock, audit, directTransactions);
  const add = async (
    id: string,
    email: string,
    stored: StoredRole[] = [],
    status: AccountStatus = "active",
  ) => {
    const account = Account.register({
      id,
      firstName: "Awa",
      lastName: "Ndong",
      identifier: requireIdentifier(email),
      passwordHash: "hash:x",
      now: clock.now(),
    });
    if (status !== "pending") account.markVerified(requireIdentifier(email), clock.now());
    await accounts.save(Account.restore({ ...account.snapshot(), status, roles: stored }));
  };
  await add(ADMIN_ID, "admin@exemple.ga", ["admin"]);
  await add(AWA_ID, "awa@exemple.ga");
  const admin = { accountId: ADMIN_ID, roles: ["client", "admin"] as const };
  return { service, accounts, audit, add, admin };
}

describe("Attribution des rôles (S4-T06, CRIT-06)", () => {
  it("un administrateur accorde « vendeur » : rôle ajouté, une ligne de journal", async () => {
    const { service, audit, admin } = await setup();
    const view = await service.grant(admin, AWA_ID, "vendor", CTX);
    expect(view.roles).toEqual(["client", "vendor"]);
    expect(audit.entries).toEqual([
      {
        action: "role.granted",
        actor: { type: "account", id: ADMIN_ID },
        target: { type: "account", id: AWA_ID },
        details: { role: "vendor", source: "api" },
        context: CTX,
      },
    ]);
  });

  it("accorder deux fois : sans effet, une seule ligne de journal", async () => {
    const { service, audit, admin } = await setup();
    await service.grant(admin, AWA_ID, "moderator", CTX);
    const again = await service.grant(admin, AWA_ID, "moderator", CTX);
    expect(again.roles).toEqual(["client", "moderator"]);
    expect(audit.actions()).toEqual(["role.granted"]);
  });

  it("retirer : effet et ligne de journal ; retirer un rôle absent n'écrit rien", async () => {
    const { service, audit, admin } = await setup();
    await service.grant(admin, AWA_ID, "vendor", CTX);
    expect((await service.revoke(admin, AWA_ID, "vendor", CTX)).roles).toEqual(["client"]);
    await service.revoke(admin, AWA_ID, "vendor", CTX);
    expect(audit.actions()).toEqual(["role.granted", "role.revoked"]);
  });

  it("jamais « admin » par l'API, jamais sur soi-même, jamais sans être administrateur", async () => {
    const { service, audit, admin } = await setup();
    await expect(service.grant(admin, AWA_ID, "admin", CTX)).rejects.toMatchObject({
      code: "ROLE_NON_ATTRIBUABLE",
    });
    await expect(service.revoke(admin, ADMIN_ID, "moderator", CTX)).rejects.toMatchObject({
      code: "ROLE_SUR_SOI_INTERDIT",
    });
    const moderator = { accountId: AWA_ID, roles: ["client", "moderator"] as const };
    await expect(service.grant(moderator, ADMIN_ID, "vendor", CTX)).rejects.toMatchObject({
      code: "ACCES_REFUSE",
    });
    expect(audit.entries).toEqual([]);
  });

  it("compte inconnu : 404 ; compte non actif : pas de nouveau rôle, mais on peut en retirer", async () => {
    const { service, add, admin } = await setup();
    await expect(
      service.grant(admin, "33333333-3333-4333-8333-333333333333", "vendor", CTX),
    ).rejects.toMatchObject({ code: "COMPTE_INTROUVABLE" });
    const closed = "44444444-4444-4444-8444-444444444444";
    await add(closed, "ferme@exemple.ga", ["vendor"], "disabled");
    await expect(service.grant(admin, closed, "moderator", CTX)).rejects.toMatchObject({
      code: "COMPTE_INACTIF",
    });
    expect((await service.revoke(admin, closed, "vendor", CTX)).roles).toEqual(["client"]);
  });

  it("recherche par e-mail : vue d'administration, jamais le hachage", async () => {
    const { service } = await setup();
    const found = await service.lookup("AWA@exemple.ga");
    expect(found).toMatchObject({ id: AWA_ID, status: "active", roles: ["client"] });
    expect(JSON.stringify(found)).not.toContain("hash");
    await expect(service.lookup("personne@exemple.ga")).rejects.toMatchObject({
      code: "COMPTE_INTROUVABLE",
    });
    await expect(service.lookup("pas une adresse")).rejects.toMatchObject({
      code: "IDENTIFIANT_INVALIDE",
    });
  });
});

describe("Premier administrateur : commande serveur (S4-T06)", () => {
  it("accorde « admin » à un compte actif, au nom du serveur, une seule fois", async () => {
    const { service, audit } = await setup();
    await expect(service.grantAdminFromServer("awa@exemple.ga")).resolves.toEqual({
      accountId: AWA_ID,
      changed: true,
    });
    await expect(service.grantAdminFromServer("awa@exemple.ga")).resolves.toMatchObject({
      changed: false,
    });
    expect(audit.entries).toEqual([
      {
        action: "role.granted",
        actor: { type: "system" },
        target: { type: "account", id: AWA_ID },
        details: { role: "admin", source: "server" },
        context: { ip: null, requestId: null },
      },
    ]);
  });

  it("refuse un compte inconnu ou pas encore vérifié (BR-041)", async () => {
    const { service, add } = await setup();
    await expect(service.grantAdminFromServer("inconnu@exemple.ga")).rejects.toMatchObject({
      code: "COMPTE_INTROUVABLE",
    });
    await add("55555555-5555-4555-8555-555555555555", "attente@exemple.ga", [], "pending");
    await expect(service.grantAdminFromServer("attente@exemple.ga")).rejects.toMatchObject({
      code: "COMPTE_INACTIF",
    });
  });

  it("retire « admin » (compte compromis, départ)", async () => {
    const { service, accounts, audit } = await setup();
    await expect(service.revokeAdminFromServer("admin@exemple.ga")).resolves.toEqual({
      accountId: ADMIN_ID,
      changed: true,
    });
    expect((await accounts.findById(ADMIN_ID))?.roles).toEqual(["client"]);
    expect(audit.actions()).toEqual(["role.revoked"]);
  });
});
