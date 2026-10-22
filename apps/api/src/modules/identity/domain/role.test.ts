import { describe, expect, it } from "vitest";
import {
  assertCanChangeRole,
  isStaff,
  effectiveRoles,
  hasRole,
  isRecentLogin,
  RECENT_LOGIN_MS,
} from "./role.js";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("Rôles (RBAC, S4-T06)", () => {
  it("tout compte est client ; les rôles sont cumulables", () => {
    expect(effectiveRoles([])).toEqual(["client"]);
    expect(effectiveRoles(["admin", "vendor"])).toEqual(["client", "vendor", "admin"]);
  });

  it("équipe : quatre rôles séparés, l'administrateur a tous leurs droits", () => {
    for (const role of ["catalog", "logistics", "finance", "support"] as const) {
      expect(hasRole(effectiveRoles(["admin"]), role)).toBe(true);
      expect(isStaff(effectiveRoles([role]))).toBe(true);
    }
    expect(hasRole(effectiveRoles(["logistics"]), "finance")).toBe(false);
    expect(hasRole(effectiveRoles(["support"]), "catalog")).toBe(false);
    expect(isStaff(effectiveRoles(["vendor"]))).toBe(false);
  });

  it("hiérarchie : l'administrateur a les droits du catalogue, pas ceux du vendeur", () => {
    const admin = effectiveRoles(["admin"]);
    expect(hasRole(admin, "admin")).toBe(true);
    expect(hasRole(admin, "catalog")).toBe(true);
    expect(hasRole(admin, "vendor")).toBe(false);
    expect(hasRole(admin, "client")).toBe(true);
    const catalog = effectiveRoles(["catalog"]);
    expect(hasRole(catalog, "admin")).toBe(false);
    expect(hasRole(effectiveRoles(["vendor"]), "catalog")).toBe(false);
  });

  it("CRIT-06 : seul un administrateur change un rôle, jamais « admin » ni « client »", () => {
    const admin = effectiveRoles(["admin"]);
    expect(() =>
      assertCanChangeRole({ actorId: ADMIN, actorRoles: admin, targetId: OTHER, role: "vendor" }),
    ).not.toThrow();
    expect(() =>
      assertCanChangeRole({
        actorId: ADMIN,
        actorRoles: admin,
        targetId: OTHER,
        role: "catalog",
      }),
    ).not.toThrow();
    for (const role of ["admin", "client", "root"]) {
      expect(() =>
        assertCanChangeRole({ actorId: ADMIN, actorRoles: admin, targetId: OTHER, role }),
      ).toThrow(expect.objectContaining({ code: "ROLE_NON_ATTRIBUABLE" }));
    }
    // Un modérateur ou un vendeur ne peut rien accorder (MED-07 : hiérarchie)
    for (const stored of [["catalog"], ["vendor"], []] as const) {
      expect(() =>
        assertCanChangeRole({
          actorId: ADMIN,
          actorRoles: effectiveRoles(stored),
          targetId: OTHER,
          role: "vendor",
        }),
      ).toThrow(expect.objectContaining({ code: "ACCES_REFUSE" }));
    }
  });

  it("personne ne modifie ses propres rôles", () => {
    expect(() =>
      assertCanChangeRole({
        actorId: ADMIN,
        actorRoles: effectiveRoles(["admin"]),
        targetId: ADMIN,
        role: "vendor",
      }),
    ).toThrow(expect.objectContaining({ code: "ROLE_SUR_SOI_INTERDIT" }));
    // Même UUID écrit en majuscules : toujours soi-même
    expect(() =>
      assertCanChangeRole({
        actorId: ADMIN,
        actorRoles: effectiveRoles(["admin"]),
        targetId: ADMIN.toUpperCase(),
        role: "catalog",
      }),
    ).toThrow(expect.objectContaining({ code: "ROLE_SUR_SOI_INTERDIT" }));
  });

  it("connexion récente : moins de 15 minutes, jamais dans le futur", () => {
    const opened = new Date("2026-10-08T10:00:00Z");
    const at = (ms: number) => new Date(opened.getTime() + ms);
    expect(isRecentLogin(opened, at(0))).toBe(true);
    expect(isRecentLogin(opened, at(RECENT_LOGIN_MS - 1))).toBe(true);
    expect(isRecentLogin(opened, at(RECENT_LOGIN_MS))).toBe(false);
    expect(isRecentLogin(opened, at(-1))).toBe(false);
  });
});
