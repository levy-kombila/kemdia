import { describe, expect, it } from "vitest";
import { isInternalKey } from "./rate-limit.js";

describe("clé interne du site", () => {
  const key = "k".repeat(40);

  it("reconnue seulement si elle est configurée et identique", () => {
    expect(isInternalKey(key, key)).toBe(true);
    expect(isInternalKey(`${key}x`, key)).toBe(false);
    expect(isInternalKey("k".repeat(39) + "j", key)).toBe(false);
    expect(isInternalKey(key, undefined)).toBe(false);
    expect(isInternalKey(undefined, key)).toBe(false);
    expect(isInternalKey([key], key)).toBe(false);
  });
});
