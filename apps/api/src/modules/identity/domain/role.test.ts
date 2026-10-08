import { describe, expect, it } from "vitest";
import {
  assertCanChangeRole,
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

  it("hiérarchie : l'administrateur a les droits du modérateur, pas ceux du vendeur", () => {
    const admin = effectiveRoles(["admin"]);
    expect(hasRole(admin, "admin")).toBe(true);
    expect(hasRole(admin, "moderator")).toBe(true);
    expect(hasRole(admin, "vendor")).toBe(false);
    expect(hasRole(admin, "client")).toBe(true);
    const moderator = effectiveRoles(["moderator"]);
    expect(hasRole(moderator, "admin")).toBe(false);
    expect(hasRole(effectiveRoles(["vendor"]), "moderator")).toBe(false);
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
        role: "moderator",
      }),
    ).not.toThrow();
    for (const role of ["admin", "client", "root"]) {
      expect(() =>
        assertCanChangeRole({ actorId: ADMIN, actorRoles: admin, targetId: OTHER, role }),
      ).toThrow(expect.objectContaining({ code: "ROLE_NON_ATTRIBUABLE" }));
    }
    // Un modérateur ou un vendeur ne peut rien accorder (MED-07 : hiérarchie)
    for (const stored of [["moderator"], ["vendor"], []] as const) {
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
