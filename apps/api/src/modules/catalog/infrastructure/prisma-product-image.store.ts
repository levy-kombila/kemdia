import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { ProductImageStore, StoredImage } from "../application/ports.js";
import type { ImageSize, ProcessedImage } from "../domain/product-image.js";

/**
 * Photos dans PostgreSQL (S6-T04, ADR-0035 ; choix du 2026-10-16) : gratuit, déjà sauvegardé avec le reste, et
 * remplaçable par un stockage objet sans toucher au reste du code (port `ProductImageStore`). Les écritures rejoignent
 * la transaction en cours ; une photo ne se modifie jamais (déclencheur SQL), elle se remplace.
 */
@Injectable()
export class PrismaProductImageStore implements ProductImageStore {
  constructor(private readonly tx: TransactionContext) {}

  async save(imageId: string, productId: string, image: ProcessedImage, now: Date): Promise<void> {
    await this.tx.db.productImage.create({
      data: {
        id: imageId,
        productId,
        large: Buffer.from(image.large),
        small: Buffer.from(image.small),
        width: image.width,
        height: image.height,
        sha256: image.sha256,
        createdAt: now,
      },
    });
  }

  async describe(imageId: string): Promise<{ productId: string; sha256: string } | null> {
    return this.tx.db.productImage.findUnique({
      where: { id: imageId },
      select: { productId: true, sha256: true },
    });
  }

  async read(imageId: string, size: ImageSize): Promise<StoredImage | null> {
    // Une seule taille lue : la vignette d'une liste ne charge pas la grande image
    const row = await this.tx.db.productImage.findUnique({
      where: { id: imageId },
      select: {
        id: true,
        productId: true,
        sha256: true,
        large: size === "large",
        small: size === "small",
      },
    });
    if (!row) return null;
    const bytes = size === "large" ? row.large : row.small;
    if (!bytes) return null;
    return {
      id: row.id,
      productId: row.productId,
      sha256: row.sha256,
      bytes: new Uint8Array(bytes),
    };
  }

  async delete(imageId: string, productId: string): Promise<void> {
    await this.tx.db.productImage.deleteMany({ where: { id: imageId, productId } });
  }
}
