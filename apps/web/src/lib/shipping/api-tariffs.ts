import "server-only";
import {
  DeliveryTariffsSchema,
  INTERNAL_KEY_HEADER,
  type DeliveryTariffs,
} from "@kemdia/contracts";
import { ZONES, type DeliveryTariffTable } from "@kemdia/contracts/delivery";
import { tariffTableOf } from "./tariff-table";

/** Barème gardé 5 minutes (choix du 2026-10-18). */
export const TARIFF_TTL_MS = 5 * 60_000;
/** Première lecture seulement : au-delà, barème du contrat (la page ne reste jamais bloquée). */
export const FIRST_READ_WAIT_MS = 1_000;

export interface TariffSourceOptions {
  url: string;
  key: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  now?: () => number;
}

/**
 * Barème de livraison lu sur l'API (`GET /shipping/tariffs`, S7-T02, ADR-0041), depuis le serveur du site seulement.
 *
 * - Gardé en mémoire 5 minutes ; ensuite, la valeur gardée est rendue TOUT DE SUITE et relue en arrière-plan.
 * - Toute première lecture : on attend au plus 1 s, puis barème du contrat (API endormie de la démo, panne).
 * - Réponse vérifiée par le contrat ; erreur, délai dépassé, réponse non conforme : barème gardé ou du contrat.
 *
 * Seulement une ESTIMATION d'affichage : le devis et la commande, calculés par l'API, font foi.
 */
export function createTariffSource(options: TariffSourceOptions) {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let kept: { table: DeliveryTariffTable; expires: number } | null = null;
  let inflight: Promise<DeliveryTariffTable> | null = null;

  async function load(): Promise<DeliveryTariffTable> {
    let tariffs: DeliveryTariffs | null = null;
    try {
      const response = await doFetch(`${options.url}/api/v1/shipping/tariffs`, {
        headers: { accept: "application/json", [INTERNAL_KEY_HEADER]: options.key },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      const parsed = DeliveryTariffsSchema.safeParse(
        response.ok ? await response.json().catch(() => undefined) : undefined,
      );
      if (parsed.success) tariffs = parsed.data;
      else console.error(`[livraison] barème : réponse refusée (statut ${response.status})`);
    } catch {
      console.error("[livraison] barème : API injoignable");
    }
    if (tariffs) {
      const table = tariffTableOf(tariffs);
      kept = { table, expires: now() + TARIFF_TTL_MS };
      return table;
    }
    // Échec : on garde l'ancienne valeur (ou le contrat) et on réessaiera dans 1 minute
    const table = kept?.table ?? ZONES;
    kept = { table, expires: now() + 60_000 };
    return table;
  }

  function refresh(): Promise<DeliveryTariffTable> {
    inflight ??= load().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return {
    async current(): Promise<DeliveryTariffTable> {
      if (kept) {
        if (kept.expires <= now()) void refresh();
        return kept.table;
      }
      const wait = new Promise<DeliveryTariffTable>((resolve) => {
        setTimeout(() => resolve(ZONES), FIRST_READ_WAIT_MS).unref?.();
      });
      return Promise.race([refresh(), wait]);
    },
  };
}

export type TariffSource = ReturnType<typeof createTariffSource>;
