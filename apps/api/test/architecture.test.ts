import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkImport, checkModules, importsOf } from "./architecture.js";

const MODULES = fileURLToPath(new URL("../src/modules", import.meta.url));
const file = (path: string) => join(MODULES, path);

describe("Architecture (ADR-0006, hexagonale)", () => {
  it("le code actuel respecte toutes les règles", () => {
    expect(checkModules(MODULES)).toEqual([]);
  });

  describe("règles", () => {
    it("le domaine ne dépend d'aucun framework", () => {
      expect(checkImport(MODULES, file("catalog/domain/product.ts"), "@nestjs/common")).toMatch(
        /domain.*@nestjs\/common/,
      );
      expect(
        checkImport(MODULES, file("catalog/domain/product.ts"), "@prisma/client"),
      ).not.toBeNull();
      expect(checkImport(MODULES, file("catalog/domain/product.ts"), "zod")).not.toBeNull();
      expect(checkImport(MODULES, file("catalog/domain/product.ts"), "node:crypto")).toBeNull();
    });

    it("le domaine ne dépend d'aucune autre couche", () => {
      expect(
        checkImport(MODULES, file("catalog/domain/product.ts"), "../infrastructure/prisma.js"),
      ).toMatch(/infrastructure/);
      expect(checkImport(MODULES, file("catalog/domain/product.ts"), "./money.js")).toBeNull();
    });

    it("le contrat HTTP : constantes pour l'application, schémas pour l'interface, rien pour le domaine", () => {
      expect(
        checkImport(MODULES, file("catalog/domain/product.ts"), "@kemdia/contracts/constants"),
      ).not.toBeNull();
      const useCase = file("catalog/application/list-products.ts");
      expect(checkImport(MODULES, useCase, "@kemdia/contracts/constants")).toBeNull();
      expect(checkImport(MODULES, useCase, "@kemdia/contracts")).not.toBeNull();
      expect(checkImport(MODULES, useCase, "@kemdia/contracts/demo")).not.toBeNull();
      expect(
        checkImport(MODULES, file("catalog/interface/ctrl.ts"), "@kemdia/contracts"),
      ).toBeNull();
      expect(
        checkImport(MODULES, file("catalog/infrastructure/seed.ts"), "@kemdia/contracts/demo"),
      ).toBeNull();
    });

    it("l'application ne connaît ni la base ni HTTP", () => {
      const useCase = file("catalog/application/list-products.ts");
      expect(checkImport(MODULES, useCase, "../infrastructure/prisma-products.js")).not.toBeNull();
      expect(checkImport(MODULES, useCase, "../interface/products.controller.js")).not.toBeNull();
      expect(checkImport(MODULES, useCase, "@prisma/client")).not.toBeNull();
      expect(checkImport(MODULES, useCase, "../domain/product.js")).toBeNull();
      expect(checkImport(MODULES, useCase, "@nestjs/common")).toBeNull();
    });

    it("l'infrastructure et l'interface dépendent des couches internes", () => {
      expect(
        checkImport(MODULES, file("catalog/infrastructure/repo.ts"), "../application/ports.js"),
      ).toBeNull();
      expect(
        checkImport(MODULES, file("catalog/interface/ctrl.ts"), "../application/list.js"),
      ).toBeNull();
    });

    it("on n'entre dans un autre module que par son index.ts", () => {
      const orders = file("orders/application/place-order.ts");
      expect(checkImport(MODULES, orders, "../../catalog/index.js")).toBeNull();
      expect(checkImport(MODULES, orders, "../../catalog/domain/product.js")).toMatch(
        /port public/,
      );
    });

    it("seule l'infrastructure accède à la base (PrismaService, client généré)", () => {
      const prismaService = "../../../database/prisma.service.js";
      expect(
        checkImport(MODULES, file("catalog/infrastructure/repo.ts"), prismaService),
      ).toBeNull();
      expect(checkImport(MODULES, file("catalog/application/list.ts"), prismaService)).toMatch(
        /seule la couche « infrastructure »/,
      );
      expect(checkImport(MODULES, file("catalog/interface/ctrl.ts"), prismaService)).not.toBeNull();
      expect(
        checkImport(MODULES, file("catalog/domain/p.ts"), "../../../generated/prisma/client.js"),
      ).not.toBeNull();
    });

    it("le socle technique (config, http) reste accessible", () => {
      expect(
        checkImport(MODULES, file("catalog/catalog.module.ts"), "../../config/config.module.js"),
      ).toBeNull();
    });
  });

  it("lit les imports statiques, réexportations, imports dynamiques et imports seuls", () => {
    const source = [
      'import { A } from "./a.js";',
      'import type { B } from "../b.js";',
      'export { C } from "./c.js";',
      'const d = await import("./d.js");',
      'import "reflect-metadata";',
    ].join("\n");
    expect(importsOf(source)).toEqual([
      "./a.js",
      "../b.js",
      "./c.js",
      "./d.js",
      "reflect-metadata",
    ]);
  });
});
