import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signNotification, verifyNotification } from "./webhook-signature.js";

const secret = randomBytes(32);
const body = JSON.stringify({ eventId: "e", amount: 12_500 });
const now = 1_760_000_000;

describe("Signature des notifications (S5-T05)", () => {
  it("authentique et récente : acceptée", () => {
    expect(verifyNotification(signNotification(secret, now, body), body, secret, now)).toBe("ok");
    expect(verifyNotification(signNotification(secret, now - 300, body), body, secret, now)).toBe(
      "ok",
    );
  });

  it("corps modifié, autre clé, en-tête absent ou mal formé : invalide", () => {
    const header = signNotification(secret, now, body);
    expect(verifyNotification(header, body.replace("12500", "125"), secret, now)).toBe("invalide");
    expect(verifyNotification(header, body, randomBytes(32), now)).toBe("invalide");
    expect(verifyNotification(undefined, body, secret, now)).toBe("invalide");
    expect(verifyNotification("t=abc,v1=00", body, secret, now)).toBe("invalide");
    expect(verifyNotification(header.replace(/v1=./, "v1=0"), body, secret, now)).toBe("invalide");
    expect(verifyNotification(`${header},v0=00`, body, secret, now)).toBe("invalide");
  });

  it("date changée par un attaquant : la signature ne correspond plus", () => {
    const header = signNotification(secret, now - 3_600, body);
    const moved = header.replace(`t=${now - 3_600}`, `t=${now}`);
    expect(verifyNotification(moved, body, secret, now)).toBe("invalide");
  });

  it("authentique mais vieille de plus de 5 minutes (ou dans le futur) : expirée", () => {
    expect(verifyNotification(signNotification(secret, now - 301, body), body, secret, now)).toBe(
      "expiree",
    );
    expect(verifyNotification(signNotification(secret, now + 301, body), body, secret, now)).toBe(
      "expiree",
    );
  });

  it("clé trop courte : toujours refusée", () => {
    const short = randomBytes(16);
    expect(verifyNotification(signNotification(short, now, body), body, short, now)).toBe(
      "invalide",
    );
  });
});
