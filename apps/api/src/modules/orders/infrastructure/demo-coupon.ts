import { DEMO_COUPON } from "@kemdia/contracts/constants";
import type { PrismaService } from "../../../database/prisma.service.js";

/**
 * Code promo de démonstration (S5-T08, ADR-0030) : `DEMO10`, 10 %, 10 000 FCFA au plus, une fois par compte.
 * Créé par l'import de démonstration (démo Render et poste de développement seulement, voir `demo-import.ts`).
 *
 * Relançable : s'il existe déjà, il n'est PAS modifié (compteur d'utilisations, activation par un administrateur).
 * Identifiant et auteur fixes : un import ne crée jamais de doublon, et l'auteur désigne l'import, pas une personne.
 */
export const DEMO_COUPON_ID = "0000de30-0000-4000-8000-000000000010";
/** Auteur « système » de l'import de démonstration (aucun compte n'a cet identifiant). */
export const DEMO_IMPORT_AUTHOR = "00000000-0000-4000-8000-00000000de30";
/** Valable depuis le début de la démo du Sprint 5 (date fixe : l'import relancé ne change rien). */
const STARTS_AT = new Date("2026-10-01T00:00:00Z");

export async function ensureDemoCoupon(
  prisma: Pick<PrismaService, "coupon">,
  now = new Date(),
): Promise<"créé" | "déjà présent"> {
  const existing = await prisma.coupon.findUnique({ where: { code: DEMO_COUPON.code } });
  if (existing) return "déjà présent";
  await prisma.coupon.upsert({
    where: { code: DEMO_COUPON.code },
    update: {},
    create: {
      id: DEMO_COUPON_ID,
      code: DEMO_COUPON.code,
      kind: "PERCENT",
      value: DEMO_COUPON.percent,
      maxDiscount: DEMO_COUPON.maxDiscount,
      minSubtotal: null,
      startsAt: STARTS_AT,
      endsAt: null,
      usageLimit: null,
      perAccountLimit: DEMO_COUPON.perAccountLimit,
      stackableWithSales: false,
      createdBy: DEMO_IMPORT_AUTHOR,
      createdAt: now,
      updatedAt: now,
    },
  });
  return "créé";
}
