import { expect } from "@playwright/test";

/**
 * Boîte de test Mailpit (S4-T05) : en CI, l'API du job envoie ses e-mails à Mailpit (EMAIL_TRANSPORT=mailpit),
 * et les tests y lisent le code reçu, comme le ferait le client. Jamais utilisé contre la démo.
 */
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL;

type Summary = { ID: string; Subject: string };

/** Dernier e-mail reçu par `to` dont le sujet contient `subject` (attend jusqu'à 15 s). */
export async function lastEmail(
  to: string,
  subject: string,
): Promise<{ subject: string; text: string }> {
  let found: Summary | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=10`,
        );
        const body = (await res.json()) as { messages: Summary[] };
        // Plus récent en premier
        found = body.messages.find((m) => m.Subject.includes(subject));
        return !!found;
      },
      { timeout: 15_000, message: `e-mail « ${subject} » pour ${to}` },
    )
    .toBe(true);
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${found!.ID}`);
  const message = (await res.json()) as { Subject: string; Text: string };
  return { subject: message.Subject, text: message.Text };
}

/** Code à 6 chiffres du dernier e-mail de vérification. */
export async function lastCode(to: string, subject: string): Promise<string> {
  const { text } = await lastEmail(to, subject);
  const code = /\b(\d{6})\b/.exec(text)?.[1];
  expect(code, "code à 6 chiffres dans l'e-mail").toBeDefined();
  return code!;
}
