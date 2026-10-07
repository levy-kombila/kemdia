import { z } from "zod";

// Messages de validation en français
z.config(z.locales.fr());

/**
 * Où le site lit le catalogue (ADR-0011, mode fichier retiré au S3-T08) : **toujours dans l'API**.
 * La configuration est vérifiée UNE fois, au démarrage du serveur :
 *
 * | Configuration                    | Résultat                                                          |
 * | -------------------------------- | ----------------------------------------------------------------- |
 * | `API_URL` + `API_INTERNAL_KEY`   | le catalogue est lu dans l'API ; si elle ne répond pas : erreur   |
 * | l'une des deux absente           | le serveur REFUSE de démarrer (message en français)               |
 *
 * Les messages d'erreur nomment les variables, jamais leur valeur (la clé est un secret).
 */

export const APP_ENVS = ["local", "e2e", "demo", "staging", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export type CatalogSource = { url: string; key: string; timeoutMs: number };

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
  // Jusqu'à 90 s pour la démo Render (S3-T07) : l'API gratuite peut mettre ~1 min à se réveiller.
  // En staging et en production, garder la valeur par défaut (5 s) : une panne doit se voir vite.
  CATALOG_TIMEOUT_MS: z.coerce.number().int().min(500).max(90_000).default(5_000),
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
  const { API_URL, API_INTERNAL_KEY, CATALOG_TIMEOUT_MS } = parsed.data;

  const missing = [
    !API_URL &&
      "API_URL : obligatoire (adresse de l'API, ex. http://localhost:4000 — voir README, « Démarrage rapide »)",
    !API_INTERNAL_KEY &&
      "API_INTERNAL_KEY : obligatoire (même clé que dans apps/api/.env ; sans elle, tous les visiteurs partagent la limite de débit de l'API)",
  ].filter((problem): problem is string => Boolean(problem));
  if (!API_URL || !API_INTERNAL_KEY) throw new SiteConfigError(missing);
  return {
    url: new URL(API_URL).href.replace(/\/+$/, ""),
    key: API_INTERNAL_KEY,
    timeoutMs: CATALOG_TIMEOUT_MS,
  };
}

/** Description lisible, sans secret, pour le journal de démarrage. */
export function describeCatalogSource(source: CatalogSource): string {
  return `API ${source.url} (délai ${source.timeoutMs} ms)`;
}
