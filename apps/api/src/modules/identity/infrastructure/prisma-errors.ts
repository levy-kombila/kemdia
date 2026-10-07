/** Violation d'unicité (Prisma P2002), reconnue sans dépendre de la classe d'erreur exacte du client généré. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
  );
}
