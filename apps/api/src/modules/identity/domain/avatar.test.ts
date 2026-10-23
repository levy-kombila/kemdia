import { describe, expect, it } from "vitest";
import {
  AVATAR_RULES,
  avatarVersionOf,
  checkAvatarDimensions,
  checkAvatarUpload,
  checkProcessedAvatar,
  sniffAvatarFormat,
} from "./avatar.js";

const bytes = (...b: number[]) => new Uint8Array(b);
const webp = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);

describe("photo de profil : règles (S7.5-T08)", () => {
  it("format lu dans les octets, jamais dans un nom", () => {
    expect(sniffAvatarFormat(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffAvatarFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniffAvatarFormat(webp)).toBe("webp");
    expect(sniffAvatarFormat(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("fichier vide, trop lourd ou inconnu : PHOTO_INVALIDE", () => {
    const code = (f: () => unknown) => {
      try {
        f();
        return "aucune erreur";
      } catch (e) {
        return (e as { code?: string }).code;
      }
    };
    expect(code(() => checkAvatarUpload(new Uint8Array()))).toBe("PHOTO_INVALIDE");
    expect(code(() => checkAvatarUpload(new Uint8Array(AVATAR_RULES.maxUploadBytes + 1)))).toBe(
      "PHOTO_INVALIDE",
    );
    expect(checkAvatarUpload(webp)).toBe("webp");
    expect(code(() => checkAvatarDimensions(199, 800))).toBe("PHOTO_INVALIDE");
    expect(code(() => checkAvatarDimensions(200, 200))).toBe("aucune erreur");
  });

  it("garde-fou du résultat et version", () => {
    expect(() => checkProcessedAvatar({ image: webp, sha256: "a".repeat(64) })).not.toThrow();
    expect(() =>
      checkProcessedAvatar({ image: bytes(0xff, 0xd8, 0xff), sha256: "a".repeat(64) }),
    ).toThrow();
    expect(() => checkProcessedAvatar({ image: webp, sha256: "xyz" })).toThrow();
    expect(avatarVersionOf("0123456789abcdef" + "f".repeat(48))).toBe("0123456789abcdef");
  });
});
