import { describe, expect, it } from "vitest";
import { formatLog } from "./log";

describe("journal du site (S7-T06)", () => {
  it("hors production : texte lisible « [scope] message »", () => {
    expect(
      formatLog("error", "catalogue", "/products : API injoignable", { NODE_ENV: "development" }),
    ).toBe("[catalogue] /products : API injoignable");
  });

  it("en production : une ligne JSON au format de l'API (pino)", () => {
    const line = formatLog(
      "error",
      "catalogue",
      "/products : statut 500",
      { NODE_ENV: "production", APP_VERSION: "v1.2.3", APP_ENV: "production" },
      () => 1_700_000_000_000,
    );
    expect(JSON.parse(line)).toEqual({
      level: 50,
      time: 1_700_000_000_000,
      service: "kemdia-web",
      version: "v1.2.3",
      env: "production",
      scope: "catalogue",
      msg: "/products : statut 500",
    });
    expect(JSON.parse(formatLog("warn", "x", "y", { NODE_ENV: "production" })).level).toBe(40);
    expect(JSON.parse(formatLog("info", "x", "y", { NODE_ENV: "production" })).level).toBe(30);
  });

  it("un retour à la ligne dans un message ne fabrique pas une fausse ligne de journal", () => {
    const line = formatLog("error", "x", 'a\n{"level":30,"msg":"faux"}', {
      NODE_ENV: "production",
    });
    expect(line.split("\n")).toHaveLength(1);
  });
});
