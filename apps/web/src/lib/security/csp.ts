/**
 * Content-Security-Policy à nonce (S4-T07, ADR-0021), posée par `proxy.ts` sur chaque page.
 *
 * - Scripts : SEULS ceux qui portent le nonce de la page (Next.js l'ajoute à ses propres scripts) et ceux
 *   qu'ils chargent (`'strict-dynamic'`). Un script injecté (faille XSS) n'a pas le nonce : il est bloqué.
 * - Styles : `'unsafe-inline'` gardé (choix du 2026-10-09) : React écrit des attributs `style="…"`
 *   (barres, carrousel, notes) qu'aucun nonce ne peut couvrir. Un style injecté ne peut pas exécuter de code.
 * - Nonce : 16 octets aléatoires, nouveau à chaque requête (toutes les pages sont donc rendues à la demande).
 */
export const NONCE_HEADER = "x-nonce";

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp(nonce: string, { dev = false }: { dev?: boolean } = {}): string {
  return [
    "default-src 'self'",
    // 'unsafe-eval' en développement seulement : React s'en sert pour ses messages d'erreur détaillés
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Pas de « upgrade-insecure-requests » : HSTS impose déjà HTTPS en ligne, et cette directive casserait
    // le site servi en HTTP sur le poste et dans la CI (http://127.0.0.1)
  ].join("; ");
}
