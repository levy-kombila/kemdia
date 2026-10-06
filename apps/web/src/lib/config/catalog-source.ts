import { z } from "zod";

// Messages de validation en français
z.config(z.locales.fr());

/**
 * D'où le site lit le catalogue (décision S3-T05, ADR-0011). Choisi UNE fois, au démarrage du serveur :
 *
 * | Configuration                        | Source                                                          |
 * | ------------------------------------ | --------------------------------------------------------------- |
 * | `API_URL` définie                    | l'API, uniquement. Si elle ne répond pas : page d'erreur.        |
 * |                                      | Jamais de bascule automatique sur le fichier.                    |
 * | `API_URL` absente                    | le fichier de démonstration (jusqu'au S3-T07)                    |
 * | `API_URL` absente, `APP_ENV=production` | le site REFUSE de démarrer                                    |
 *
 * Les messages d'erreur nomment les variables, jamais leur valeur (la clé est un secret).
 */

export const APP_ENVS = ["local", "e2e", "demo", "staging", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export type CatalogSource =
  { kind: "api"; url: string; key: string; timeoutMs: number } | { kind: "file" };

export class SiteConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(
      [
        "Configuration du site invalide : le serveur ne peut pas démarrer.",
        ...problems.map((p) => `  - ${p}`),
        "Voir apps/web/.env.example pour la liste des variables.",
      ].join("\n"),
    );
    this.name = "SiteConfigError";
  }
}

const schema = z.object({
  APP_ENV: z.enum(APP_ENVS).default("local"),
  API_URL: z
    .url({ protocol: /^https?$/, error: "adresse http(s)://… attendue" })
    .refine((value) => {
      const url = new URL(value);
      return !url.username && !url.password && !url.search && !url.hash;
    }, "sans identifiants, paramètres ni ancre (la clé va dans API_INTERNAL_KEY)")
    .optional(),
  API_INTERNAL_KEY: z
    .string()
    .regex(/^[A-Za-z0-9_-]{32,128}$/, "32 à 128 caractères parmi A-Z, a-z, 0-9, « - » et « _ »")
    .optional(),
  CATALOG_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
});

/** Lit la configuration (fonction pure : testée sans serveur). Lève une `SiteConfigError` si elle est fausse. */
export function resolveCatalogSource(env: Record<string, string | undefined>): CatalogSource {
  // Une variable définie mais vide (« API_URL= ») est traitée comme absente
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ""),
  );
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    throw new SiteConfigError(
      parsed.error.issues.map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`),
    );
  }
  const { APP_ENV, API_URL, API_INTERNAL_KEY, CATALOG_TIMEOUT_MS } = parsed.data;

  if (!API_URL) {
    if (APP_ENV === "production") {
      throw new SiteConfigError([
        "API_URL : obligatoire en production (le fichier de démonstration y est interdit)",
      ]);
    }
    if (API_INTERNAL_KEY) {
      throw new SiteConfigError([
        "API_INTERNAL_KEY définie sans API_URL : configuration incomplète (ajoutez API_URL ou retirez la clé)",
      ]);
    }
    return { kind: "file" };
  }
  if (!API_INTERNAL_KEY) {
    throw new SiteConfigError([
      "API_INTERNAL_KEY : obligatoire avec API_URL (sans elle, tous les visiteurs partagent la limite de débit de l'API)",
    ]);
  }
  return {
    kind: "api",
    url: new URL(API_URL).href.replace(/\/+$/, ""),
    key: API_INTERNAL_KEY,
    timeoutMs: CATALOG_TIMEOUT_MS,
  };
}

/** Description lisible, sans secret, pour le journal de démarrage. */
export function describeCatalogSource(source: CatalogSource): string {
  return source.kind === "api"
    ? `API ${source.url} (délai ${source.timeoutMs} ms)`
    : "fichier de démonstration (aucune API)";
}
