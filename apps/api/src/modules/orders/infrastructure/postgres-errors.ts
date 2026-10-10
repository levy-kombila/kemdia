import { OrdersError } from "../domain/orders-error.js";

/** Code d'erreur PostgreSQL d'une requête refusée, tel que le client Prisma 7 (adaptateur pg) le transmet. */
export function postgresCode(error: unknown): string | undefined {
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } })
    ?.meta;
  const code = meta?.driverAdapterError?.cause?.originalCode;
  return typeof code === "string" ? code : undefined;
}

/** Attente d'un verrou ou d'une connexion trop longue → « réessayez dans un instant ». */
export function busyError(): OrdersError {
  return new OrdersError(
    "PANIER_OCCUPE",
    "une autre opération est en cours sur votre panier ou votre commande : réessayez dans un instant",
    1,
  );
}

/**
 * Codes qui veulent dire « trop d'attente » : verrou (PostgreSQL 55P03), durée maximale de la transaction (Prisma P2028)
 * ou attente d'une connexion libre (Prisma P2024).
 */
export function isBusy(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return postgresCode(error) === "55P03" || code === "P2028" || code === "P2024";
}
