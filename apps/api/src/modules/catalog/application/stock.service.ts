import { Inject, Injectable } from "@nestjs/common";
import {
  STOCK_REPOSITORY,
  type ReservedVariant,
  type StockLine,
  type StockRepository,
} from "./ports.js";

/** La réservation a échoué pour au moins une ligne : rien ne doit être gardé (la transaction est annulée). */
export class StockUnavailableError extends Error {
  constructor(readonly variantIds: readonly string[]) {
    super("stock insuffisant ou produit indisponible");
    this.name = "StockUnavailableError";
  }
}

/**
 * Stock des variantes (S5-T02) : réservé dans la MÊME transaction que la création de la commande (BR-012, pas de
 * survente), remis en cas d'annulation. Port public du catalogue pour le module `orders`.
 */
@Injectable()
export class StockService {
  constructor(@Inject(STOCK_REPOSITORY) private readonly stock: StockRepository) {}

  /** Réserve toutes les lignes ou lève `StockUnavailableError` (l'appelant laisse alors sa transaction s'annuler). */
  async reserve(lines: readonly StockLine[]): Promise<ReservedVariant[]> {
    const { reserved, failed } = await this.stock.reserve(normalize(lines));
    if (failed.length) throw new StockUnavailableError(failed);
    return reserved;
  }

  release(lines: readonly StockLine[]): Promise<void> {
    return this.stock.release(normalize(lines));
  }
}

/** Minuscules, quantités d'une même variante additionnées, ordre des identifiants (verrous toujours pris dans le même ordre). */
function normalize(lines: readonly StockLine[]): StockLine[] {
  const total = new Map<string, number>();
  for (const { variantId, quantity } of lines) {
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new RangeError("quantité : entier positif");
    }
    const id = variantId.toLowerCase();
    total.set(id, (total.get(id) ?? 0) + quantity);
  }
  return [...total]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([variantId, quantity]) => ({ variantId, quantity }));
}
