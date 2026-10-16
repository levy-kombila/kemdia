import { describe, expect, it } from "vitest";
import {
  PRODUCT_IMAGE_RULES,
  checkDimensions,
  checkProcessed,
  checkUpload,
  reordered,
  sniffFormat,
  vendorImageId,
  vendorImagePath,
  withAddedImage,
  withoutImage,
} from "./product-image.js";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const code = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code ?? (error as Error).message;
  }
  return "aucune erreur";
};
const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);
const webp = () => {
  const head = ascii("RIFF\0\0\0\0WEBPVP8 ");
  const out = new Uint8Array(64);
  out.set(head);
  return out;
};

describe("Photos des vendeurs : fichier reçu (S6-T04)", () => {
  it("reconnaît JPEG, PNG et WebP par leur contenu", () => {
    expect(sniffFormat(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("png");
    expect(sniffFormat(webp())).toBe("webp");
  });

  it("refuse tout le reste, même renommé : SVG, HTML, GIF, PDF, fichier vide ou tronqué", () => {
    for (const file of [
      ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      ascii("<!doctype html><script>alert(1)</script>"),
      ascii("GIF89a......"),
      ascii("%PDF-1.7"),
      bytes(0xff, 0xd8),
      ascii("RIFF\0\0\0\0WAVE"),
      new Uint8Array(),
    ]) {
      expect(code(() => checkUpload(file))).toBe("FORMAT_IMAGE_INVALIDE");
    }
  });

  it("5 Mo au plus", () => {
    const big = new Uint8Array(PRODUCT_IMAGE_RULES.maxUploadBytes + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(code(() => checkUpload(big))).toBe("IMAGE_TROP_GRANDE");
    expect(code(() => checkUpload(big.subarray(0, PRODUCT_IMAGE_RULES.maxUploadBytes)))).toBe(
      "aucune erreur",
    );
  });

  it("200 pixels au moins de chaque côté", () => {
    expect(code(() => checkDimensions(199, 1000))).toBe("IMAGE_TROP_PETITE");
    expect(code(() => checkDimensions(200, 200))).toBe("aucune erreur");
  });

  it("garde-fou sur le résultat du réencodage : WebP, taille et dimensions bornées", () => {
    const ok = { large: webp(), small: webp(), width: 1600, height: 900, sha256: "0".repeat(64) };
    expect(code(() => checkProcessed(ok))).toBe("aucune erreur");
    expect(code(() => checkProcessed({ ...ok, small: bytes(0xff, 0xd8, 0xff) }))).toMatch(
      /résultat inattendu/,
    );
    expect(code(() => checkProcessed({ ...ok, width: 1601 }))).toMatch(/dimensions/);
    const huge = new Uint8Array(PRODUCT_IMAGE_RULES.maxStoredBytes + 1);
    huge.set(webp());
    expect(code(() => checkProcessed({ ...ok, large: huge }))).toMatch(/résultat inattendu/);
  });
});

describe("Photos des vendeurs : liste du produit (S6-T04)", () => {
  it("adresse « /images/v/<id>.webp », lue dans les deux sens ; une photo du catalogue Kemdia n'a pas d'identifiant", () => {
    expect(vendorImagePath(A.toUpperCase())).toBe(`/images/v/${A}.webp`);
    expect(vendorImageId(`/images/v/${A}.webp`)).toBe(A);
    expect(vendorImageId("/images/products/pagne.webp")).toBeNull();
    expect(vendorImageId(`/images/v/${A}.webp?x=1`)).toBeNull();
    expect(vendorImageId(`/images/v/../${A}.webp`)).toBeNull();
  });

  it("10 photos au plus", () => {
    const nine = Array.from({ length: 9 }, (_, i) => `/images/v/${i}.webp`);
    expect(withAddedImage(nine, A)).toHaveLength(10);
    expect(code(() => withAddedImage([...nine, "x"], A))).toBe("TROP_DE_PHOTOS");
  });

  it("retrait : la photo doit appartenir au produit", () => {
    const list = [vendorImagePath(A), vendorImagePath(B)];
    expect(withoutImage(list, B.toUpperCase())).toEqual([vendorImagePath(A)]);
    expect(code(() => withoutImage(list, C))).toBe("PHOTO_INTROUVABLE");
  });

  it("nouvel ordre : exactement les mêmes photos, chacune une fois", () => {
    const list = [vendorImagePath(A), vendorImagePath(B)];
    expect(reordered(list, [B, A])).toEqual([vendorImagePath(B), vendorImagePath(A)]);
    for (const ids of [[A], [A, A], [A, C], [A, B, C]]) {
      expect(code(() => reordered(list, ids))).toBe("PRODUIT_INVALIDE");
    }
  });
});
