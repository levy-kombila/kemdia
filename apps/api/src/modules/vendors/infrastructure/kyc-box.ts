import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { AppConfig } from "../../../config/env.js";
import type { KycBox } from "../application/ports.js";
import { VendorsError } from "../domain/vendors-error.js";

/**
 * Chiffrement des dossiers de vérification (S6-T08, ADR-0039) : AES-256-GCM, clé `KYC_ENCRYPTION_KEY` (différente de
 * celle de la double authentification : l'une peut changer sans l'autre).
 *
 * Boîte : version (1 octet, = 1) ‖ vecteur d'initialisation (12) ‖ étiquette (16) ‖ contenu chiffré. Données
 * associées : « boutique:champ » (ex. `…:id_number`, `…:id_front`). Une boîte recopiée sur une autre boutique, ou
 * d'un champ à l'autre, ne se déchiffre pas.
 */
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Clé de développement, publique (elle est dans Git) : poste de développement et tests SEULEMENT. Jamais en démo, car
 * de vraies pièces d'identité peuvent y être envoyées.
 */
const DEVELOPMENT_KEY = createHash("sha256").update("kemdia-dev-kyc-key-not-a-secret").digest();

export class AesKycBox implements KycBox {
  readonly available: boolean;
  readonly usesDevelopmentKey: boolean;
  private readonly key: Buffer | null;

  constructor(config: Pick<AppConfig, "KYC_ENCRYPTION_KEY" | "APP_ENV" | "NODE_ENV">) {
    if (config.KYC_ENCRYPTION_KEY) {
      this.key = Buffer.from(config.KYC_ENCRYPTION_KEY, "base64url");
    } else if (config.APP_ENV === "local" && config.NODE_ENV !== "production") {
      this.key = DEVELOPMENT_KEY;
    } else {
      this.key = null;
    }
    this.available = this.key?.length === 32;
    this.usesDevelopmentKey = this.key === DEVELOPMENT_KEY;
  }

  seal(plain: Uint8Array, context: string): Uint8Array {
    const key = this.requireKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(context));
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return new Uint8Array(Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]));
  }

  open(box: Uint8Array, context: string): Uint8Array {
    const key = this.requireKey();
    const data = Buffer.from(box);
    if (data.length <= 1 + IV_BYTES + TAG_BYTES || data[0] !== VERSION) {
      throw new Error("dossier de vérification illisible (format)");
    }
    const iv = data.subarray(1, 1 + IV_BYTES);
    const tag = data.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(tag);
    // Clé changée ou boîte modifiée : l'étiquette ne correspond pas, `final` lève une erreur
    return new Uint8Array(
      Buffer.concat([decipher.update(data.subarray(1 + IV_BYTES + TAG_BYTES)), decipher.final()]),
    );
  }

  private requireKey(): Buffer {
    if (!this.key || !this.available) {
      throw new VendorsError(
        "KYC_INDISPONIBLE",
        "vérification des vendeurs indisponible : clé de chiffrement absente",
      );
    }
    return this.key;
  }
}
