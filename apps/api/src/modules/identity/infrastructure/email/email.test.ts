import { describe, expect, it, vi } from "vitest";
import { BREVO_SEND_URL, BrevoTransport } from "../../../../mail/brevo-transport.js";
import { EmailOtpSender } from "./email-otp-sender.js";
import { renderEmail } from "./email-templates.js";
import type { FetchLike } from "../../../../mail/http-mail.js";
import { MailpitTransport } from "../../../../mail/mailpit-transport.js";

const KEY = `xkeysib-${"b".repeat(64)}-Secret123456`;
const EMAIL = { to: "awa@exemple.ga", subject: "S", text: "T", html: "<p>H</p>" };

function fakeFetch(status: number, body = "{}") {
  return vi.fn<FetchLike>(() => Promise.resolve(new Response(body, { status })));
}

describe("modèles d'e-mails", () => {
  it("code d'inscription : le code, sa durée, aucun lien", () => {
    const email = renderEmail({
      kind: "code",
      channel: "email",
      to: "awa@exemple.ga",
      code: "042917",
      purpose: "signup",
    });
    expect(email.subject).toBe("Votre code de vérification Kemdia");
    expect(email.subject).not.toContain("042917");
    expect(email.text).toContain("042917");
    expect(email.html).toContain("042917");
    expect(email.text).toMatch(/10 minutes/);
    expect(email.html).not.toMatch(/<a |href=|<img/i);
  });

  it("code de mot de passe oublié : autre sujet", () => {
    const email = renderEmail({
      kind: "code",
      channel: "email",
      to: "a@b.ga",
      code: "111111",
      purpose: "reset",
    });
    expect(email.subject).toMatch(/mot de passe/);
  });

  it("alerte : aucun code, rassure le titulaire", () => {
    const email = renderEmail({ kind: "signup-alert", channel: "email", to: "awa@exemple.ga" });
    expect(email.subject).toBe("Tentative d'inscription avec votre adresse");
    expect(email.text).not.toMatch(/\d{6}/);
    expect(email.text).toMatch(/n'a pas été modifié/);
  });

  it("mot de passe modifié : aucun code, dit quoi faire si ce n'était pas vous", () => {
    const email = renderEmail({ kind: "password-changed", channel: "email", to: "awa@exemple.ga" });
    expect(email.subject).toBe("Votre mot de passe Kemdia a été modifié");
    expect(email.text).not.toMatch(/\d{6}/);
    expect(email.html).not.toMatch(/<a |href=|<img/i);
  });

  it("l'envoi par e-mail refuse un message SMS", async () => {
    const sender = new EmailOtpSender({ name: "test", send: vi.fn() });
    await expect(
      sender.send({
        kind: "code",
        channel: "sms",
        to: "+241077123456",
        code: "123456",
        purpose: "signup",
      }),
    ).rejects.toThrow(/sms/);
  });
});

describe("Brevo", () => {
  it("appelle l'API avec la clé dans l'en-tête et l'expéditeur vérifié", async () => {
    const fetch = fakeFetch(201, '{"messageId":"<x@relay>"}');
    await new BrevoTransport(
      { apiKey: KEY, from: "kemdia.demo@gmail.com", fromName: "Kemdia" },
      fetch,
    ).send(EMAIL);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(BREVO_SEND_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["api-key"]).toBe(KEY);
    expect(JSON.parse(init.body as string)).toMatchObject({
      sender: { email: "kemdia.demo@gmail.com", name: "Kemdia" },
      to: [{ email: "awa@exemple.ga" }],
      subject: "S",
      textContent: "T",
      htmlContent: "<p>H</p>",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("refus de Brevo : message avec le statut seulement, jamais la clé ni la réponse", async () => {
    const fetch = fakeFetch(401, `{"message":"Key not found ${KEY} awa@exemple.ga"}`);
    const transport = new BrevoTransport(
      { apiKey: KEY, from: "a@b.ga", fromName: "Kemdia" },
      fetch,
    );
    const error = await transport.send(EMAIL).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Brevo : réponse HTTP 401");
  });

  it("Brevo injoignable ou trop lent", async () => {
    const down = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    await expect(
      new BrevoTransport({ apiKey: KEY, from: "a@b.ga", fromName: "K" }, down).send(EMAIL),
    ).rejects.toThrow("Brevo : injoignable");
    const slow = vi.fn(() =>
      Promise.reject(Object.assign(new Error("t"), { name: "TimeoutError" })),
    );
    await expect(
      new BrevoTransport({ apiKey: KEY, from: "a@b.ga", fromName: "K" }, slow).send(EMAIL),
    ).rejects.toThrow("Brevo : délai dépassé");
  });
});

describe("Mailpit", () => {
  it("API d'envoi de Mailpit", async () => {
    const fetch = fakeFetch(200, '{"ID":"abc"}');
    await new MailpitTransport(
      { url: "http://mailpit:8025", from: "no-reply@kemdia.local", fromName: "Kemdia" },
      fetch,
    ).send(EMAIL);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://mailpit:8025/api/v1/send");
    expect(JSON.parse(init.body as string)).toMatchObject({
      From: { Email: "no-reply@kemdia.local", Name: "Kemdia" },
      To: [{ Email: "awa@exemple.ga" }],
      Subject: "S",
      Text: "T",
      HTML: "<p>H</p>",
    });
  });
});
