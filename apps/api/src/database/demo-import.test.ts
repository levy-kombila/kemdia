import { describe, expect, it, vi } from "vitest";
import {
  demoCouponAllowed,
  describeError,
  runDemoImport,
  type DemoImporter,
} from "./demo-import.js";

const SECRET = "s3cret-pass";
const DEMO = {
  NODE_ENV: "production",
  APP_ENV: "demo",
  APP_VERSION: "sha-abc123",
  DATABASE_URL: `postgresql://kemdia:${SECRET}@ep-demo.eu-central-1.aws.neon.tech/kemdia?sslmode=require`,
};

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, log: (m: string) => out.push(m), error: (m: string) => err.push(m) };
}

const ok: DemoImporter = () => Promise.resolve({ categories: 112, products: 50 });

describe("runDemoImport (catalogue de démonstration)", () => {
  it("importe avec la configuration validée et annonce le résultat", async () => {
    const importer = vi.fn(ok);
    const io = capture();
    await expect(
      runDemoImport({ env: DEMO, allowedEnvs: ["demo"], importer, ...io }),
    ).resolves.toBe(0);
    expect(importer).toHaveBeenCalledOnce();
    expect(importer.mock.calls[0]![0]).toMatchObject({
      APP_ENV: "demo",
      DATABASE_URL: DEMO.DATABASE_URL,
    });
    expect(io.out.join("\n")).toMatch(/112 catégories, 50 produits/);
  });

  it("refuse un environnement non permis sans toucher la base (production, staging pour l'image)", async () => {
    for (const APP_ENV of ["production", "staging"]) {
      const importer = vi.fn(ok);
      const io = capture();
      await expect(
        runDemoImport({ env: { ...DEMO, APP_ENV }, allowedEnvs: ["demo"], importer, ...io }),
      ).resolves.toBe(1);
      expect(importer).not.toHaveBeenCalled();
      expect(io.err.join("\n")).toMatch(new RegExp(`refusé : APP_ENV=${APP_ENV}`));
    }
  });

  it("configuration fausse : refus (code 1) avec le message de l'API, sans aucune valeur", async () => {
    const importer = vi.fn(ok);
    const io = capture();
    const env = { ...DEMO, DATABASE_URL: `mysql://kemdia:${SECRET}@db/kemdia` };
    await expect(runDemoImport({ env, allowedEnvs: ["demo"], importer, ...io })).resolves.toBe(1);
    expect(importer).not.toHaveBeenCalled();
    expect(io.err.join("\n")).toMatch(/Configuration invalide[\s\S]*DATABASE_URL/);
    expect(io.err.join("\n")).not.toContain(SECRET);
  });

  it("échec de l'écriture : code 1, type et code de l'erreur seulement (jamais son message)", async () => {
    const failure = Object.assign(new Error(`connexion à ${DEMO.DATABASE_URL} refusée`), {
      code: "ECONNREFUSED",
    });
    const io = capture();
    await expect(
      runDemoImport({
        env: DEMO,
        allowedEnvs: ["demo"],
        importer: () => Promise.reject(failure),
        ...io,
      }),
    ).resolves.toBe(1);
    expect(io.err.join("\n")).toBe("Import de démonstration : ÉCHEC (Error ECONNREFUSED).");
  });

  it("describeError ignore un code qui ressemblerait à une valeur", () => {
    expect(describeError("texte")).toBe("erreur inconnue");
    expect(describeError(Object.assign(new TypeError("x"), { code: `a b ${SECRET}` }))).toBe(
      "TypeError",
    );
  });
});

describe("code promo de démonstration (S5-T08)", () => {
  const local = "postgresql://kemdia:kemdia@localhost:5432/kemdia";
  const remote = "postgresql://kemdia:x@ep-preprod.eu-central-1.aws.neon.tech/kemdia";
  const allowed = (APP_ENV: string, NODE_ENV: string, DATABASE_URL: string) =>
    demoCouponAllowed({ APP_ENV, NODE_ENV, DATABASE_URL } as Parameters<
      typeof demoCouponAllowed
    >[0]);

  it("démo Render : oui", () => {
    expect(allowed("demo", "production", remote)).toBe(true);
  });

  it("poste de développement : seulement sur une base locale, hors NODE_ENV=production", () => {
    expect(allowed("local", "development", local)).toBe(true);
    expect(allowed("local", "development", "postgresql://k:k@db:5432/kemdia")).toBe(true);
    expect(allowed("local", "development", "postgresql://k:k@127.0.0.1:5432/kemdia_e2e")).toBe(
      true,
    );
    // APP_ENV absent (local par défaut) mais base distante : pas de coupon sur une vraie base
    expect(allowed("local", "development", remote)).toBe(false);
    expect(allowed("local", "production", local)).toBe(false);
  });

  it("préproduction et production : jamais", () => {
    expect(allowed("staging", "production", local)).toBe(false);
    expect(allowed("production", "production", local)).toBe(false);
  });
});
