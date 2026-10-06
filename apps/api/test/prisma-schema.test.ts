import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkPrismaSchema, readPrismaFiles, type PrismaFile } from "./prisma-schema.js";

const SCHEMA_DIR = fileURLToPath(new URL("../prisma/schema", import.meta.url));

const main = (schemas: string[]): PrismaFile => ({
  module: "main",
  source: `datasource db {\n  provider = "postgresql"\n  schemas = [${schemas.map((s) => `"${s}"`).join(", ")}]\n}\n`,
});
const file = (module: string, source: string): PrismaFile => ({ module, source });

describe("Schéma Prisma : un schéma PostgreSQL par module (ADR-0006)", () => {
  it("le schéma actuel respecte toutes les règles", () => {
    expect(checkPrismaSchema(readPrismaFiles(SCHEMA_DIR))).toEqual([]);
  });

  it("chaque modèle porte le schéma de son module", () => {
    const problems = checkPrismaSchema([
      main(["catalog"]),
      file("catalog", 'model Produit {\n  id String @id\n  @@schema("orders")\n}\n'),
    ]);
    expect(problems).toEqual([expect.stringContaining('Produit doit porter @@schema("catalog")')]);
  });

  it("la liste des schémas correspond aux fichiers de modules", () => {
    expect(checkPrismaSchema([main(["catalog"]), file("catalog", ""), file("orders", "")])).toEqual(
      [expect.stringContaining("au lieu de [catalog, orders]")],
    );
  });

  it("refuse une relation vers le modèle d'un autre module", () => {
    const problems = checkPrismaSchema([
      main(["catalog", "orders"]),
      file("catalog", 'model Produit {\n  id String @id\n  @@schema("catalog")\n}\n'),
      file(
        "orders",
        [
          "model LigneCommande {",
          "  id        String  @id",
          "  produitId String  @db.Uuid // UUID seul : autorisé",
          "  produit   Produit @relation(fields: [produitId], references: [id])",
          '  @@schema("orders")',
          "}",
        ].join("\n"),
      ),
    ]);
    expect(problems).toEqual([
      expect.stringContaining("LigneCommande référence Produit du module « catalog »"),
    ]);
  });

  it("autorise les relations à l'intérieur d'un module", () => {
    const catalog = file(
      "catalog",
      [
        "model Categorie {",
        "  id       String    @id",
        "  produits Produit[]",
        '  @@schema("catalog")',
        "}",
        "model Produit {",
        "  id          String    @id",
        "  categorie   Categorie @relation(fields: [categorieId], references: [id])",
        "  categorieId String",
        '  @@schema("catalog")',
        "}",
      ].join("\n"),
    );
    expect(checkPrismaSchema([main(["catalog"]), catalog])).toEqual([]);
  });

  it("aucun modèle dans main.prisma", () => {
    const withModel: PrismaFile = {
      module: "main",
      source:
        main(["catalog"]).source + 'model Divers {\n  id String @id\n  @@schema("catalog")\n}\n',
    };
    expect(checkPrismaSchema([withModel, file("catalog", "")])).toEqual([
      expect.stringContaining("aucun modèle ici"),
    ]);
  });
});
