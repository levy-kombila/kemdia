import "reflect-metadata";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../../test/identity/in-memory.js";
import type { AuthenticatedSession } from "../application/session.service.js";
import type { Role } from "../domain/role.js";
import { Authorize, RoleGuard } from "./role.guard.js";

@Authorize("admin", { secondFactor: true })
class AdminOnly {
  list() {}
  /** Une règle plus faible sur la méthode ne doit PAS ouvrir la route */
  @Authorize("client")
  weaker() {}
}

class Unprotected {
  open() {}
}

class Mixed {
  @Authorize(["vendor", "catalog"])
  team() {}
}

const clock = new FakeClock(new Date("2026-10-08T10:00:00Z"));
/** Comptes dont la double authentification est activée (« a » : oui) */
const enabled = new Set(["a"]);
const guard = new RoleGuard(new Reflector(), clock, {
  find: (accountId: string) =>
    Promise.resolve(
      enabled.has(accountId)
        ? { accountId, secretBox: new Uint8Array(), enabledAt: new Date(), lastUsedStep: 1 }
        : null,
    ),
});

function contextFor(
  target: new () => object,
  method: string,
  roles: Role[] | null,
  confirmedMinutesAgo: number | null = 1,
  accountId = "a",
): ExecutionContext {
  const session: AuthenticatedSession | undefined = roles
    ? {
        sessionId: "s",
        openedAt: new Date(clock.now().getTime() - 60 * 60_000),
        secondFactorAt:
          confirmedMinutesAgo === null
            ? null
            : new Date(clock.now().getTime() - confirmedMinutesAgo * 60_000),
        expiresAt: new Date("2026-11-08T10:00:00Z"),
        account: {
          id: accountId,
          firstName: "Awa",
          lastName: "N",
          email: null,
          phone: null,
          roles,
          avatar: null,
        },
      }
    : undefined;
  const handler = (target.prototype as Record<string, () => void>)[method]!;
  return {
    getClass: () => target,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => ({ identitySession: session }) }),
  } as unknown as ExecutionContext;
}

const check = (ctx: ExecutionContext) => guard.canActivate(ctx);
const code = (status: number, value: string) =>
  expect.objectContaining({ code: value, status }) as unknown;

describe("RoleGuard (S4-T06)", () => {
  it("administrateur confirmé par la double authentification il y a moins de 15 minutes : accepté (S6-T03)", async () => {
    await expect(check(contextFor(AdminOnly, "list", ["client", "admin"]))).resolves.toBe(true);
  });

  it("client ou modérateur : 403 ACCES_REFUSE ; confirmation trop ancienne ou absente : 403 DEUX_FACTEURS_REQUIS ; pas activée : DEUX_FACTEURS_A_ACTIVER", async () => {
    await expect(check(contextFor(AdminOnly, "list", ["client"]))).rejects.toEqual(
      code(403, "ACCES_REFUSE"),
    );
    await expect(check(contextFor(AdminOnly, "list", ["client", "catalog"]))).rejects.toEqual(
      code(403, "ACCES_REFUSE"),
    );
    await expect(check(contextFor(AdminOnly, "list", ["client", "admin"], 16))).rejects.toEqual(
      code(403, "DEUX_FACTEURS_REQUIS"),
    );
    await expect(check(contextFor(AdminOnly, "list", ["client", "admin"], null))).rejects.toEqual(
      code(403, "DEUX_FACTEURS_REQUIS"),
    );
    await expect(
      check(contextFor(AdminOnly, "list", ["client", "admin"], null, "sans-2fa")),
    ).rejects.toEqual(code(403, "DEUX_FACTEURS_A_ACTIVER"));
    // Date de confirmation dans le futur (horloge faussée) : refusée
    await expect(check(contextFor(AdminOnly, "list", ["client", "admin"], -5))).rejects.toEqual(
      code(403, "DEUX_FACTEURS_REQUIS"),
    );
  });

  it("une règle de méthode n'affaiblit jamais celle du contrôleur", async () => {
    await expect(check(contextFor(AdminOnly, "weaker", ["client"]))).rejects.toEqual(
      code(403, "ACCES_REFUSE"),
    );
    await expect(check(contextFor(AdminOnly, "weaker", ["client", "admin"], 16))).rejects.toEqual(
      code(403, "DEUX_FACTEURS_REQUIS"),
    );
  });

  it("fermée par défaut : sans règle ou sans session, refus", async () => {
    await expect(check(contextFor(Unprotected, "open", ["client", "admin"]))).rejects.toEqual(
      code(403, "ACCES_REFUSE"),
    );
    await expect(check(contextFor(AdminOnly, "list", null))).rejects.toEqual(
      code(403, "ACCES_REFUSE"),
    );
  });

  it("plusieurs rôles possibles ; l'administrateur a les droits du modérateur, pas du vendeur", async () => {
    await expect(check(contextFor(Mixed, "team", ["client", "vendor"]))).resolves.toBe(true);
    await expect(check(contextFor(Mixed, "team", ["client", "admin"]))).resolves.toBe(true);
    await expect(check(contextFor(Mixed, "team", ["client"]))).rejects.toEqual(
      code(403, "ACCES_REFUSE"),
    );
  });
});
