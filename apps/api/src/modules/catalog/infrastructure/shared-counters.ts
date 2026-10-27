import { RATE_COUNTERS } from "../../../database/rate-counters.js";
import { CATALOG_COUNTERS } from "../application/ports.js";

/** Compteurs partagés par toutes les instances de l'API (S8-T07, ADR-0064), vus par le module comme son port. */
export const sharedCountersProvider = { provide: CATALOG_COUNTERS, useExisting: RATE_COUNTERS };
