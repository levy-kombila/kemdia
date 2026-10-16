import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { AppConfig } from "../../../config/env.js";
import type { SecretBox } from "../application/ports.js";

/**
 * Chiffrement des secrets TOTP (S6-T03, ADR-0034) : AES-256-GCM, clé `TOTP_ENCRYPTION_KEY`.
 *
 * Boîte : version de clé (1 octet, = 1) ‖ vecteur d'initialisation (12) ‖ étiquette (16) ‖ secret chiffré.
 * Données associées : l'UUID du compte. Un secret copié sur un autre compte (par qui écrit dans la base) ne se
 * déchiffre pas : la vérification de l'étiquette échoue.
 */
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Clé de développement : publique par nature (elle est dans Git), elle ne protège rien. Utilisée seulement sans
 * `TOTP_ENCRYPTION_KEY`, en local et en démo (aucun vrai compte d'équipe) ; jamais en préproduction ni en production.
 */
const DEVELOPMENT_KEY = createHash("sha256").update("kemdia-dev-totp-key-not-a-secret").digest();

export class AesSecretBox implements SecretBox {
  readonly available: boolean;
  /** Clé de développement fixe en service : à signaler au démarrage (jamais sur un vrai serveur) */
  readonly usesDevelopmentKey: boolean;
  private readonly key: Buffer | null;

  constructor(config: Pick<AppConfig, "TOTP_ENCRYPTION_KEY" | "APP_ENV" | "NODE_ENV">) {
    if (config.TOTP_ENCRYPTION_KEY) {
      this.key = Buffer.from(config.TOTP_ENCRYPTION_KEY, "base64url");
    } else if (
      (config.APP_ENV === "local" && config.NODE_ENV !== "production") ||
      config.APP_ENV === "demo"
    ) {
      this.key = DEVELOPMENT_KEY;
    } else {
      this.key = null;
    }
    this.available = this.key?.length === 32;
    this.usesDevelopmentKey = this.key === DEVELOPMENT_KEY;
  }

  seal(plain: Uint8Array, accountId: string): Uint8Array {
    const key = this.requireKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(accountId.toLowerCase()));
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return new Uint8Array(Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]));
  }

  open(box: Uint8Array, accountId: string): Uint8Array {
    const key = this.requireKey();
    const data = Buffer.from(box);
    if (data.length <= 1 + IV_BYTES + TAG_BYTES || data[0] !== VERSION) {
      throw new Error("secret de double authentification illisible (format)");
    }
    const iv = data.subarray(1, 1 + IV_BYTES);
    const tag = data.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(accountId.toLowerCase()));
    decipher.setAuthTag(tag);
    // Clé changée ou boîte modifiée : l'étiquette ne correspond pas, `final` lève une erreur
    return new Uint8Array(
      Buffer.concat([decipher.update(data.subarray(1 + IV_BYTES + TAG_BYTES)), decipher.final()]),
    );
  }

  private requireKey(): Buffer {
    if (!this.key || !this.available) throw new Error("TOTP_ENCRYPTION_KEY absente");
    return this.key;
  }
}
