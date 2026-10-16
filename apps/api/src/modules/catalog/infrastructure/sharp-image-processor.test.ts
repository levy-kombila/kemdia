import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SharpImageProcessor } from "./sharp-image-processor.js";

const processor = new SharpImageProcessor();
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "aucune erreur",
    (error: { code?: string }) => error.code,
  );
const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } });

describe("SharpImageProcessor : réencodage des photos (S6-T04)", () => {
  it("JPEG de téléphone : WebP en deux tailles, orientation appliquée, AUCUNE métadonnée gardée", async () => {
    // 3000 × 2000 pris « de côté » (orientation 6) avec EXIF : le résultat est un portrait 1067 × 1600
    const photo = await solid(3000, 2000)
      .jpeg()
      .withExif({ IFD0: { Make: "Téléphone", Model: "X", Copyright: "secret" } })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeDefined();
    const image = await processor.process(new Uint8Array(photo));
    expect([image.width, image.height]).toEqual([1067, 1600]);
    const large = await sharp(image.large).metadata();
    const small = await sharp(image.small).metadata();
    expect(large).toMatchObject({ format: "webp", width: 1067, height: 1600 });
    expect(small).toMatchObject({ format: "webp", width: 320, height: 480 });
    for (const meta of [large, small]) {
      expect(meta.exif).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
    }
    expect(image.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("la vignette est tirée de la grande image (celle que voit la modération)", async () => {
    const photo = await solid(3200, 3200).png().toBuffer();
    const image = await processor.process(new Uint8Array(photo));
    const fromLarge = await sharp(Buffer.from(image.large))
      .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75, effort: 4 })
      .toBuffer();
    expect(Buffer.from(image.small).equals(fromLarge)).toBe(true);
  });

  it("deux réencodages à la fois au plus : les envois suivants attendent leur tour, sans échouer", async () => {
    const photo = await solid(1200, 900).jpeg().toBuffer();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => processor.process(new Uint8Array(photo))),
    );
    expect(results.map((r) => r.width)).toEqual([1200, 1200, 1200, 1200, 1200, 1200]);
  });

  it("jamais agrandie : une petite photo garde sa taille", async () => {
    const png = await solid(400, 300).png().toBuffer();
    const image = await processor.process(new Uint8Array(png));
    expect([image.width, image.height]).toEqual([400, 300]);
    expect((await sharp(image.small).metadata()).width).toBe(400);
  });

  it("WebP animé : seule la première image est gardée", async () => {
    const frame = (background: string) =>
      sharp({ create: { width: 300, height: 600, channels: 3, background } })
        .png()
        .toBuffer();
    const animated = await sharp([await frame("red"), await frame("blue")], {
      join: { animated: true },
    })
      .webp({ loop: 0 })
      .toBuffer();
    expect((await sharp(animated, { pages: -1 }).metadata()).pages).toBe(2);
    const image = await processor.process(new Uint8Array(animated));
    expect((await sharp(image.large, { pages: -1 }).metadata()).pages ?? 1).toBe(1);
    expect([image.width, image.height]).toEqual([300, 600]);
  });

  it("refuse une image trop petite, illisible, ou qui annonce plus de 40 mégapixels", async () => {
    const tiny = await solid(150, 600).jpeg().toBuffer();
    expect(await code(processor.process(new Uint8Array(tiny)))).toBe("IMAGE_TROP_PETITE");

    // En-tête JPEG valide suivi de n'importe quoi
    const junk = new Uint8Array(2000).fill(7);
    junk.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(await code(processor.process(junk))).toBe("FORMAT_IMAGE_INVALIDE");

    // PNG tronqué : en-tête correct, image illisible
    const png = await solid(300, 300).png().toBuffer();
    const truncated = png.subarray(0, 60);
    expect(await code(processor.process(new Uint8Array(truncated)))).toBe("FORMAT_IMAGE_INVALIDE");

    // « Bombe » : 8 000 × 8 000 d'une seule couleur, quelques Ko seulement
    const bomb = await solid(8000, 8000).png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(5 * 1024 * 1024);
    expect(await code(processor.process(new Uint8Array(bomb)))).toBe("IMAGE_TROP_GRANDE");
  });
});
