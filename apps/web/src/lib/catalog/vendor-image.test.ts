import { describe, expect, it } from "vitest";
import { isVendorImage, parseVendorImageFile, vendorThumbnail } from "./vendor-image";

const ID = "0f0e0d0c-0b0a-4908-8706-050403020100";

describe("Photos des vendeurs : adresses (S6-T04)", () => {
  it("reconnaît une photo de vendeur et en déduit la vignette ; le reste ne change pas", () => {
    expect(isVendorImage(`/images/v/${ID}.webp`)).toBe(true);
    expect(vendorThumbnail(`/images/v/${ID}.webp`)).toBe(`/images/v/${ID}-480.webp`);
    for (const src of [
      "/images/products/pagne.webp",
      "/images/placeholder.svg",
      `/images/v/${ID}.png`,
    ]) {
      expect(isVendorImage(src)).toBe(false);
      expect(vendorThumbnail(src)).toBe(src);
    }
  });

  it("relais : seuls « <uuid>.webp » et « <uuid>-480.webp » sont acceptés", () => {
    expect(parseVendorImageFile(`${ID}.webp`)).toEqual({ imageId: ID, size: "large" });
    expect(parseVendorImageFile(`${ID}-480.webp`)).toEqual({ imageId: ID, size: "small" });
    for (const file of [
      `${ID.toUpperCase()}.webp`,
      `${ID}.png`,
      `${ID}-100.webp`,
      `../${ID}.webp`,
      `${ID}.webp?x`,
      "x.webp",
      "",
    ]) {
      expect(parseVendorImageFile(file)).toBeNull();
    }
  });
});
