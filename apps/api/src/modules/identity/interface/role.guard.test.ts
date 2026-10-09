import "reflect-metadata";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../../test/identity/in-memory.js";
import type { AuthenticatedSession } from "../application/session.service.js";
import type { Role } from "../domain/role.js";
import { Authorize, RoleGuard } from "./role.guard.js";

@Authorize("admin", { recentLogin: true })
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
  @Authorize(["vendor", "moderator"])
  team() {}
}

const clock = new FakeClock(new Date("2026-10-08T10:00:00Z"));
const guard = new RoleGuard(new Reflector(), clock);

function contextFor(
  target: new () => object,
  method: string,
  roles: Role[] | null,
  openedMinutesAgo = 1,
): ExecutionContext {
  const session: AuthenticatedSession | undefined = roles
    ? {
        sessionId: "s",
        openedAt: new Date(clock.now().getTime() - openedMinutesAgo * 60_000),
        expiresAt: new Date("2026-11-08T10:00:00Z"),
        account: { id: "a", firstName: "Awa", lastName: "N", email: null, phone: null, roles },
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
  it("administrateur récemment connecté : accepté", async () => {
    await expect(check(contextFor(AdminOnly, "list", ["client", "admin"]))).resolves.toBe(true);
  });

  it("client ou modérateur : 403 ACCES_REFUSE ; connexion trop ancienne : 403 RECONNEXION_REQUISE", async () => {
    await expect(check(contextFor(AdminOnly, "list", ["client"]))).rejects.toEqual(
      code(403, "ACCES_REFUSE"),
    );
    await expect(check(contextFor(AdminOnly, "list", ["client", "moderator"]))).rejects.toEqual(
      code(403, "ACCES_REFUSE"),
    );
    await expect(check(contextFor(AdminOnly, "list", ["client", "admin"], 16))).rejects.toEqual(
      code(403, "RECONNEXION_REQUISE"),
    );
  });

  it("une règle de méthode n'affaiblit jamais celle du contrôleur", async () => {
    await expect(check(contextFor(AdminOnly, "weaker", ["client"]))).rejects.toEqual(
      code(403, "ACCES_REFUSE"),
    );
    await expect(check(contextFor(AdminOnly, "weaker", ["client", "admin"], 16))).rejects.toEqual(
      code(403, "RECONNEXION_REQUISE"),
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
