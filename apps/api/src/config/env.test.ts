import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ConfigError, LOCAL_DATABASE_URL, loadConfig } from "./env.js";

const problems = (env: NodeJS.ProcessEnv): readonly string[] => {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  return [];
};

describe("loadConfig", () => {
  it("applique des valeurs par défaut sûres pour le développement", () => {
    expect(loadConfig({})).toEqual({
      NODE_ENV: "development",
      APP_ENV: "local",
      APP_VERSION: "dev",
      HOST: "0.0.0.0",
      PORT: 4000,
      LOG_LEVEL: "info",
      CORS_ORIGINS: [],
      TRUST_PROXY: 0,
      DATABASE_URL: LOCAL_DATABASE_URL,
      DATABASE_POOL_MAX: 10,
      DATABASE_STATEMENT_TIMEOUT_MS: 10_000,
      RATE_LIMIT_PER_MINUTE: 120,
      API_DOCS: true,
      SMS_ENABLED: false,
      EMAIL_TRANSPORT: "console",
      MAILPIT_URL: "http://localhost:8025",
      EMAIL_FROM: "no-reply@kemdia.local",
      EMAIL_FROM_NAME: "Kemdia",
    });
  });

  it("convertit les nombres et découpe la liste des origines", () => {
    const config = loadConfig({
      PORT: "8080",
      TRUST_PROXY: "1",
      CORS_ORIGINS: " https://kemdia.ga , https://www.kemdia.ga,",
    });
    expect(config.PORT).toBe(8080);
    expect(config.TRUST_PROXY).toBe(1);
    expect(config.CORS_ORIGINS).toEqual(["https://kemdia.ga", "https://www.kemdia.ga"]);
  });

  it("traite une variable vide comme absente", () => {
    expect(loadConfig({ PORT: "", LOG_LEVEL: "  " })).toMatchObject({
      PORT: 4000,
      LOG_LEVEL: "info",
    });
  });

  it("renvoie une configuration non modifiable", () => {
    expect(Object.isFrozen(loadConfig({}))).toBe(true);
  });

  it("refuse les valeurs invalides en nommant chaque variable", () => {
    const list = problems({
      PORT: "70000",
      LOG_LEVEL: "bavard",
      NODE_ENV: "prod",
      TRUST_PROXY: "-1",
    });
    expect(list).toHaveLength(4);
    expect(list.join("\n")).toMatch(/^PORT : /m);
    expect(list.join("\n")).toMatch(/^LOG_LEVEL : /m);
    expect(list.join("\n")).toMatch(/^NODE_ENV : /m);
    expect(list.join("\n")).toMatch(/^TRUST_PROXY : /m);
  });

  it("refuse une origine CORS qui n'est pas une adresse web", () => {
    expect(problems({ CORS_ORIGINS: "https://kemdia.ga,javascript:alert(1)" })).toEqual([
      expect.stringMatching(/^CORS_ORIGINS\[1\] : /),
    ]);
  });

  it("n'affiche jamais la valeur fautive (elle pourrait être un secret)", () => {
    const error = (() => {
      try {
        loadConfig({ PORT: "mot-de-passe-colle-par-erreur" });
      } catch (e) {
        return e as Error;
      }
    })();
    expect(error).toBeInstanceOf(ConfigError);
    expect(error?.message).toContain("PORT");
    expect(error?.message).not.toContain("mot-de-passe-colle-par-erreur");
  });

  describe("base de données", () => {
    it("accepte postgres:// et postgresql://", () => {
      expect(loadConfig({ DATABASE_URL: "postgres://u:p@db:5432/k" }).DATABASE_URL).toBe(
        "postgres://u:p@db:5432/k",
      );
      expect(loadConfig({ DATABASE_URL: "postgresql://u:p@db/k?sslmode=require" })).toBeTruthy();
    });

    it("refuse une autre sorte d'adresse, sans recopier le mot de passe", () => {
      const list = problems({ DATABASE_URL: "mysql://u:motdepasse-secret@db/k" });
      expect(list).toEqual(["DATABASE_URL : adresse postgresql://… attendue"]);
      expect(list.join()).not.toContain("motdepasse-secret");
    });

    it("borne la taille du groupe de connexions et la durée des requêtes", () => {
      expect(problems({ DATABASE_POOL_MAX: "0", DATABASE_STATEMENT_TIMEOUT_MS: "999999" })).toEqual(
        [
          expect.stringMatching(/^DATABASE_POOL_MAX : /),
          expect.stringMatching(/^DATABASE_STATEMENT_TIMEOUT_MS : /),
        ],
      );
    });
  });

  describe("API : limite, clé interne, documentation", () => {
    it("documentation activée par défaut, sauf en production", () => {
      expect(loadConfig({}).API_DOCS).toBe(true);
      expect(
        loadConfig({
          NODE_ENV: "production",
          APP_VERSION: "v1",
          DATABASE_URL: "postgresql://a:b@db/k",
        }).API_DOCS,
      ).toBe(false);
      expect(loadConfig({ API_DOCS: "false" }).API_DOCS).toBe(false);
    });

    it("SMS désactivé par défaut (aucun fournisseur choisi), activable par SMS_ENABLED=true", () => {
      expect(loadConfig({}).SMS_ENABLED).toBe(false);
      expect(loadConfig({ SMS_ENABLED: "true" }).SMS_ENABLED).toBe(true);
      expect(problems({ SMS_ENABLED: "oui" })).toEqual([expect.stringMatching(/^SMS_ENABLED : /)]);
    });

    it("e-mails : Brevo exige la clé et l'adresse d'expédition ; la clé n'est jamais recopiée", () => {
      const key = `xkeysib-${"c".repeat(64)}-Secret123456`;
      expect(problems({ EMAIL_TRANSPORT: "brevo" })).toEqual([
        expect.stringMatching(/^BREVO_API_KEY : obligatoire/),
        expect.stringMatching(/^EMAIL_FROM : obligatoire/),
      ]);
      const config = loadConfig({
        EMAIL_TRANSPORT: "brevo",
        BREVO_API_KEY: key,
        EMAIL_FROM: "kemdia.demo@gmail.com",
      });
      expect(config.EMAIL_TRANSPORT).toBe("brevo");
      const list = problems({ BREVO_API_KEY: "secret-pas-une-cle-brevo" });
      expect(list).toEqual([expect.stringMatching(/^BREVO_API_KEY : /)]);
      expect(list.join()).not.toContain("secret-pas-une-cle-brevo");
    });

    it("e-mails : par défaut aucun envoi hors du poste ; console et Mailpit interdits en production", () => {
      const prod = {
        NODE_ENV: "production",
        APP_VERSION: "v1",
        DATABASE_URL: "postgresql://a:b@db/k",
      };
      expect(loadConfig({ ...prod, APP_ENV: "demo" }).EMAIL_TRANSPORT).toBe("none");
      expect(problems({ ...prod, APP_ENV: "demo", EMAIL_TRANSPORT: "console" })).toEqual([
        expect.stringMatching(/^EMAIL_TRANSPORT : « console » est réservé/),
      ]);
      expect(problems({ ...prod, APP_ENV: "production", EMAIL_TRANSPORT: "mailpit" })).toEqual([
        expect.stringMatching(/^EMAIL_TRANSPORT : « mailpit »/),
      ]);
    });

    it("clé interne : 32 caractères au moins, jamais recopiée dans l'erreur", () => {
      expect(loadConfig({ API_INTERNAL_KEY: "a".repeat(32) }).API_INTERNAL_KEY).toHaveLength(32);
      const list = problems({ API_INTERNAL_KEY: "courte-et-secrete" });
      expect(list).toEqual([expect.stringMatching(/^API_INTERNAL_KEY : /)]);
      expect(list.join()).not.toContain("courte-et-secrete");
    });

    it("limite de débit bornée", () => {
      expect(problems({ RATE_LIMIT_PER_MINUTE: "1" })).toEqual([
        expect.stringMatching(/^RATE_LIMIT_PER_MINUTE/),
      ]);
    });
  });

  describe("en production", () => {
    const prod = {
      NODE_ENV: "production",
      APP_VERSION: "v0.3.0",
      DATABASE_URL: "postgresql://kemdia_app:s3cr3t@db.internal:5432/kemdia",
    } as const;

    it("accepte une configuration complète", () => {
      expect(loadConfig({ ...prod, CORS_ORIGINS: "https://kemdia.ga" }).APP_VERSION).toBe("v0.3.0");
    });

    it("exige la version de l'image et une vraie base de données", () => {
      expect(problems({ NODE_ENV: "production" })).toEqual([
        "APP_VERSION : obligatoire en production",
        "DATABASE_URL : obligatoire en production (l'adresse de développement est refusée)",
      ]);
    });

    it("exige HTTPS pour les origines CORS", () => {
      expect(problems({ ...prod, CORS_ORIGINS: "http://kemdia.ga" })).toEqual([
        "CORS_ORIGINS[0] : HTTPS obligatoire en production",
      ]);
    });

    it("interdit les journaux détaillés", () => {
      expect(problems({ ...prod, LOG_LEVEL: "debug" })).toEqual([
        expect.stringMatching(/^LOG_LEVEL : .*interdits en production/),
      ]);
    });
  });
});

describe("outil Prisma (prisma.config.ts)", () => {
  it("même base par défaut que l'API hors production : `pnpm db:deploy` marche sans DATABASE_URL dans .env", () => {
    const config = readFileSync(new URL("../../prisma.config.ts", import.meta.url), "utf8");
    expect(config).toContain(`"${LOCAL_DATABASE_URL}"`);
    expect(config).toMatch(/NODE_ENV === "production"\s*\?\s*undefined/);
  });

  it("KYC_ENCRYPTION_KEY : 32 octets, et différente de la clé TOTP (S6-T08)", () => {
    const key = "A".repeat(43);
    expect(() => loadConfig({ KYC_ENCRYPTION_KEY: key, TOTP_ENCRYPTION_KEY: key })).toThrow(
      /différente de TOTP_ENCRYPTION_KEY/,
    );
    expect(() => loadConfig({ KYC_ENCRYPTION_KEY: "trop-courte" })).toThrow(ConfigError);
    expect(
      loadConfig({ KYC_ENCRYPTION_KEY: key, TOTP_ENCRYPTION_KEY: "B".repeat(43) })
        .KYC_ENCRYPTION_KEY,
    ).toBe(key);
  });
});
