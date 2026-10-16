import type { PrismaService } from "../src/database/prisma.service.js";

/**
 * Tests d'intégration des routes d'administration (S6-T03) : les sessions de l'administrateur sont marquées comme
 * confirmées par la double authentification, pour tester la route elle-même. Le vrai parcours (QR code, codes TOTP,
 * codes de secours, blocage) est testé dans second-factor.int.test.ts.
 */
export async function confirmSecondFactor(prisma: PrismaService, accountId: string): Promise<void> {
  await prisma.session.updateMany({ where: { accountId }, data: { secondFactorAt: new Date() } });
}
