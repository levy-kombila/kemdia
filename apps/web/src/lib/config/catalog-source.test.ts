import { describe, expect, it } from "vitest";
import { SiteConfigError, describeCatalogSource, resolveCatalogSource } from "./catalog-source";

const KEY = "k".repeat(40);

const problems = (env: Record<string, string | undefined>): readonly string[] => {
  try {
    resolveCatalogSource(env);
  } catch (error) {
    if (error instanceof SiteConfigError) return error.problems;
    throw error;
  }
  return [];
};

describe("Configuration du catalogue au démarrage (S3-T05, mode fichier retiré au S3-T08)", () => {
  it("API_URL + clé : l'API, adresse normalisée", () => {
    expect(
      resolveCatalogSource({
        API_URL: "http://api:4000/",
        API_INTERNAL_KEY: KEY,
        APP_ENV: "production",
      }),
    ).toEqual({ url: "http://api:4000", key: KEY, timeoutMs: 5_000 });
  });

  it("API_URL absente : refus de démarrer dans TOUS les environnements (plus de fichier de démonstration)", () => {
    for (const APP_ENV of [undefined, "local", "e2e", "demo", "staging", "production"]) {
      expect(() => resolveCatalogSource({ APP_ENV, API_INTERNAL_KEY: KEY })).toThrow(
        SiteConfigError,
      );
      expect(problems({ APP_ENV, API_INTERNAL_KEY: KEY })).toEqual([
        expect.stringMatching(/^API_URL : obligatoire \(adresse de l'API/),
      ]);
    }
    // Variable vide = absente
    expect(problems({ API_URL: "  ", API_INTERNAL_KEY: KEY })).toHaveLength(1);
  });

  it("clé interne absente : refus ; rien du tout : les deux variables sont nommées", () => {
    expect(problems({ API_URL: "http://api:4000" })).toEqual([
      expect.stringMatching(/^API_INTERNAL_KEY : obligatoire/),
    ]);
    expect(problems({})).toEqual([
      expect.stringMatching(/^API_URL : /),
      expect.stringMatching(/^API_INTERNAL_KEY : /),
    ]);
  });

  it("refuse une adresse ou une clé invalide, sans jamais recopier leur valeur", () => {
    const list = problems({
      API_URL: "ftp://utilisateur:motdepasse@api",
      API_INTERNAL_KEY: "courte-et-secrete",
      APP_ENV: "prod",
    });
    expect(list.join("\n")).toMatch(/^APP_ENV : /m);
    expect(list.join("\n")).toMatch(/^API_URL : /m);
    expect(list.join("\n")).toMatch(/^API_INTERNAL_KEY : /m);
    expect(list.join()).not.toMatch(/motdepasse|courte-et-secrete/);
    expect(problems({ API_URL: "https://user:pass@api.kemdia.ga", API_INTERNAL_KEY: KEY })).toEqual(
      [expect.stringMatching(/^API_URL : sans identifiants/)],
    );
  });

  it("délai de réponse borné", () => {
    expect(
      problems({ API_URL: "http://api", API_INTERNAL_KEY: KEY, CATALOG_TIMEOUT_MS: "10" }),
    ).toEqual([expect.stringMatching(/^CATALOG_TIMEOUT_MS : /)]);
  });

  it("description pour le journal de démarrage, sans la clé", () => {
    const text = describeCatalogSource(
      resolveCatalogSource({ API_URL: "http://api:4000", API_INTERNAL_KEY: KEY }),
    );
    expect(text).toBe("API http://api:4000 (délai 5000 ms)");
    expect(text).not.toContain(KEY);
  });
});
