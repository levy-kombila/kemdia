import { describe, expect, it } from "vitest";
import { CATALOG_IMPORT_COLUMNS, CATALOG_IMPORT_LIMITS } from "@kemdia/contracts/constants";
import { IMPORT_COLUMNS } from "../src/modules/vendors/domain/catalog-import.js";
import { IMPORT_RULES } from "../src/modules/vendors/application/catalog-import.service.js";

describe("Import du catalogue : domaine et contrat alignés (S8-T03)", () => {
  it("mêmes colonnes, dans le même ordre ; mêmes limites", () => {
    expect([...IMPORT_COLUMNS]).toEqual([...CATALOG_IMPORT_COLUMNS]);
    expect(IMPORT_RULES).toMatchObject({
      maxRows: CATALOG_IMPORT_LIMITS.maxRows,
      referenceMax: CATALOG_IMPORT_LIMITS.referenceMax,
      errorsMax: CATALOG_IMPORT_LIMITS.errorsMax,
    });
  });
});
