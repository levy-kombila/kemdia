import { afterEach, describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots.txt", () => {
  const previous = process.env.APP_ENV;
  afterEach(() => {
    if (previous === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous;
  });

  it("démo (S4-T08) : jamais indexée", () => {
    process.env.APP_ENV = "demo";
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("ailleurs : site indexé, sauf les pages privées", () => {
    process.env.APP_ENV = "production";
    const result = robots();
    expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(result.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
