import { describe, expect, it } from "vitest";
import { sandboxPageEnabled } from "./sandbox";

describe("Téléphone simulé : seulement en local, en tests de bout en bout et en démo", () => {
  it("jamais en préproduction ni en production", () => {
    expect(sandboxPageEnabled("local")).toBe(true);
    expect(sandboxPageEnabled("e2e")).toBe(true);
    expect(sandboxPageEnabled("demo")).toBe(true);
    expect(sandboxPageEnabled("staging")).toBe(false);
    expect(sandboxPageEnabled("production")).toBe(false);
    expect(sandboxPageEnabled(undefined)).toBe(false);
  });
});
