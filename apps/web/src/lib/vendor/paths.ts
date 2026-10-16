/** Accueil de l'espace vendeur (S6-T06). */
export const VENDOR_HOME = "/vendeur";

const SEGMENT = /^[a-z0-9-]{1,64}$/;
const QUERY = /^[a-zA-Z0-9=&_-]{0,200}$/;

/**
 * Adresse de retour après la connexion : TOUJOURS une page de l'espace vendeur aux caractères simples (même règle que
 * l'espace de l'équipe) ; le reste ramène à l'accueil. Découpage simple, sans expression régulière imbriquée (ReDoS).
 */
export function vendorPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 300) return VENDOR_HOME;
  const [path = "", query, ...more] = value.split("?");
  if (more.length > 0 || (query !== undefined && !QUERY.test(query))) return VENDOR_HOME;
  const [root, area, ...segments] = path.split("/");
  const ok =
    root === "" &&
    area === "vendeur" &&
    segments.length <= 4 &&
    segments.every((s) => SEGMENT.test(s));
  return ok ? value : VENDOR_HOME;
}
