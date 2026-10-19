import "server-only";
import {
  DeliveryTariffsSchema,
  INTERNAL_KEY_HEADER,
  type DeliveryTariffs,
} from "@kemdia/contracts";
import { ZONES, type DeliveryTariffTable } from "@kemdia/contracts/delivery";
import { readAtMost } from "@/lib/orders/api-orders";
import { tariffTableOf } from "./tariff-table";
import { log } from "@/lib/log";

/** Le barème fait moins d'1 Ko : au-delà de 16 Ko, la réponse est refusée (relecture de sécurité du S7-T02). */
const MAX_BYTES = 16_384;

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
      const bytes = response.ok ? await readAtMost(response, MAX_BYTES) : null;
      let body: unknown;
      try {
        body = bytes ? JSON.parse(new TextDecoder().decode(bytes)) : undefined;
      } catch {
        body = undefined;
      }
      const parsed = DeliveryTariffsSchema.safeParse(body);
      if (parsed.success) tariffs = parsed.data;
      else log.error("livraison", `barème : réponse refusée (statut ${response.status})`);
    } catch {
      log.error("livraison", "barème : API injoignable");
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
