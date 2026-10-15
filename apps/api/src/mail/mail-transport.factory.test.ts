import { describe, expect, it } from "vitest";
import { createMailTransport } from "./mail-transport.factory.js";

const base = {
  APP_ENV: "local" as const,
  NODE_ENV: "development" as const,
  MAILPIT_URL: "http://localhost:8025",
  BREVO_API_KEY: undefined,
  EMAIL_FROM: "no-reply@kemdia.local",
  EMAIL_FROM_NAME: "Kemdia",
};

describe("Transport des e-mails des factures (S5-T06) : même réglage que les codes", () => {
  it("console seulement sur le poste ; Mailpit ; Brevo avec sa clé ; sinon aucun", () => {
    expect(createMailTransport({ ...base, EMAIL_TRANSPORT: "console" })?.name).toBe("console");
    expect(
      createMailTransport({
        ...base,
        EMAIL_TRANSPORT: "console",
        APP_ENV: "demo",
        NODE_ENV: "production",
      }),
    ).toBeNull();
    expect(createMailTransport({ ...base, EMAIL_TRANSPORT: "mailpit" })?.name).toBe("Mailpit");
    expect(createMailTransport({ ...base, EMAIL_TRANSPORT: "brevo" })).toBeNull();
    expect(
      createMailTransport({
        ...base,
        EMAIL_TRANSPORT: "brevo",
        BREVO_API_KEY: `xkeysib-${"b".repeat(64)}-x`,
      })?.name,
    ).toBe("Brevo");
    expect(createMailTransport({ ...base, EMAIL_TRANSPORT: "none" })).toBeNull();
  });
});
