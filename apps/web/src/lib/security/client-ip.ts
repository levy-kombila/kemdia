import { isIP } from "node:net";

/**
 * Adresse IP du visiteur, transmise à l'API (S4-T07, ADR-0021) pour les limites par visiteur et le journal d'audit.
 *
 * Réglage `CLIENT_IP_HEADER` (désactivé par défaut, choix du 2026-10-09) : nom de l'en-tête posé par l'hébergeur.
 * - vide : rien n'est transmis (l'API applique alors seulement ses limites par compte et par identifiant) ;
 * - `x-forwarded-for` : on prend la DERNIÈRE adresse, ajoutée par le relais de l'hébergeur (les précédentes
 *   peuvent être inventées par le visiteur) ;
 * - autre en-tête (ex. `true-client-ip`) : une seule adresse attendue, sinon rien.
 * Toute valeur qui n'est pas une adresse IP est ignorée.
 */
const HEADER_NAME = /^[a-z0-9-]{1,64}$/;

export class ClientIpConfigError extends Error {}

/** Nom de l'en-tête configuré, en minuscules ; `null` si non configuré. Lève si la valeur est invalide. */
export function clientIpHeaderName(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const raw = env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (!raw) return null;
  if (!HEADER_NAME.test(raw)) {
    throw new ClientIpConfigError(
      "CLIENT_IP_HEADER : nom d'en-tête invalide (lettres minuscules, chiffres et « - », ex. true-client-ip)",
    );
  }
  return raw;
}

export function visitorIp(headers: Headers, headerName: string | null): string | null {
  if (!headerName) return null;
  const parts = (headers.get(headerName) ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate =
    headerName === "x-forwarded-for" ? parts.at(-1) : parts.length === 1 ? parts[0] : undefined;
  return candidate && isIP(candidate) ? candidate : null;
}
