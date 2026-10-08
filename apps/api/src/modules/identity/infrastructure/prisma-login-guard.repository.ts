import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";
import {
  LOGIN_LOCK_MS,
  LOGIN_WINDOW_MS,
  MAX_LOGIN_ATTEMPTS,
  type LoginGuardState,
} from "../domain/login-guard.js";
import type { LoginGuardRepository } from "../application/ports.js";

/**
 * BR-040 dans PostgreSQL (ADR-0017). `claim` applique `nextGuardState` en UNE requête :
 * des tentatives simultanées sont comptées l'une après l'autre par la base, aucune ne passe entre deux.
 */
@Injectable()
export class PrismaLoginGuardRepository implements LoginGuardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async claim(identifier: string, now: Date): Promise<LoginGuardState> {
    const lockUntil = new Date(now.getTime() + LOGIN_LOCK_MS);
    const windowStart = new Date(now.getTime() - LOGIN_WINDOW_MS);
    // « fresh » : blocage terminé, ou aucune tentative depuis 15 minutes → on repart de zéro (nextGuardState)
    const rows = await this.prisma.$queryRaw<
      { attempts: number; locked_until: Date | null; updated_at: Date }[]
    >`
      INSERT INTO "identity"."login_guards" AS g ("identifier", "attempts", "locked_until", "updated_at")
      VALUES (${identifier}, 1, NULL, ${now})
      ON CONFLICT ("identifier") DO UPDATE SET
        "attempts" = CASE
          WHEN g."locked_until" IS NOT NULL AND g."locked_until" <= ${now} THEN 1
          WHEN g."locked_until" IS NULL AND g."updated_at" <= ${windowStart} THEN 1
          WHEN g."locked_until" IS NOT NULL THEN g."attempts"
          ELSE g."attempts" + 1 END,
        "locked_until" = CASE
          WHEN g."locked_until" IS NOT NULL AND g."locked_until" <= ${now} THEN NULL
          WHEN g."locked_until" IS NULL AND g."updated_at" <= ${windowStart} THEN NULL
          WHEN g."locked_until" IS NOT NULL THEN g."locked_until"
          WHEN g."attempts" + 1 > ${MAX_LOGIN_ATTEMPTS} THEN ${lockUntil}
          ELSE NULL END,
        "updated_at" = ${now}
      RETURNING "attempts", "locked_until", "updated_at"`;
    const row = rows[0];
    if (!row) throw new Error("login_guards : aucune ligne renvoyée");
    return { attempts: row.attempts, lockedUntil: row.locked_until, updatedAt: row.updated_at };
  }

  async lock(identifier: string, until: Date): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "identity"."login_guards"
      SET "locked_until" = CASE WHEN "locked_until" IS NULL OR "locked_until" < ${until} THEN ${until} ELSE "locked_until" END
      WHERE "identifier" = ${identifier}`;
  }

  async reset(identifier: string, now: Date): Promise<void> {
    // Jamais pendant un blocage posé en parallèle (sinon une réussite rendrait 3 essais à un attaquant)
    await this.prisma.loginGuard.deleteMany({
      where: { identifier, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
    });
  }
}
