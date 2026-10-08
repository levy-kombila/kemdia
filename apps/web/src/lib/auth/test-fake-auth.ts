import type { AuthClient, AuthResult, CodeSent, SignedIn } from "./client";

/**
 * Faux client d'identité pour les tests des formulaires : se comporte comme l'API vue par le site
 * (mêmes codes d'erreur). Le bon code est toujours {@link FAKE_CODE} ; un seul compte existe.
 * Les vraies règles (limites, blocage, énumération) sont testées dans l'API et de bout en bout.
 */
export const FAKE_CODE = "424242";
export const FAKE_ACCOUNT = {
  firstName: "Awa",
  lastName: "Ndong",
  email: "awa@exemple.ga",
  phone: null,
  roles: ["client"] as const,
};

const mask = (email: string) => `${email.slice(0, 2)}•••@${email.split("@")[1]}`;

export function createFakeAuthClient(): AuthClient & { calls: string[] } {
  const calls: string[] = [];
  let pending: { email: string; firstName: string } | null = null;
  let attempts = 0;
  const sent = (email: string): AuthResult<CodeSent> => ({
    ok: true,
    channel: "email",
    sentTo: mask(email),
    resendInSeconds: 60,
  });
  const checkCode = (code: string): AuthResult | null => {
    if (!pending) return { ok: false, code: "CODE_EXPIRE" };
    if (attempts >= 5) return { ok: false, code: "TROP_D_ESSAIS" };
    if (code !== FAKE_CODE) {
      attempts += 1;
      return { ok: false, code: attempts >= 5 ? "TROP_D_ESSAIS" : "CODE_INVALIDE" };
    }
    return null;
  };

  return {
    calls,
    login(identifier, password) {
      calls.push(`login:${identifier}`);
      if (password === "Bloque2026")
        return Promise.resolve({ ok: false, code: "COMPTE_BLOQUE", retryAfterSeconds: 900 });
      const ok = identifier === FAKE_ACCOUNT.email && password === "Mangue2026";
      return Promise.resolve<SignedIn>(
        ok ? { ok: true, account: FAKE_ACCOUNT } : { ok: false, code: "IDENTIFIANTS_INCORRECTS" },
      );
    },
    signup(input) {
      calls.push(`signup:${input.identifier}`);
      if (input.password === "Refuse2026")
        return Promise.resolve({ ok: false, code: "MOT_DE_PASSE_FAIBLE" });
      pending = { email: input.identifier, firstName: input.firstName };
      attempts = 0;
      return Promise.resolve(sent(input.identifier));
    },
    verifySignup(code) {
      calls.push(`verify:${code}`);
      const error = checkCode(code);
      if (error) return Promise.resolve(error as SignedIn);
      const account = { ...FAKE_ACCOUNT, firstName: pending!.firstName, email: pending!.email };
      pending = null;
      return Promise.resolve({ ok: true, account });
    },
    resendSignup() {
      calls.push("resend-signup");
      attempts = 0;
      return Promise.resolve(pending ? sent(pending.email) : { ok: false, code: "CODE_EXPIRE" });
    },
    requestPasswordReset(identifier) {
      calls.push(`forgot:${identifier}`);
      if (identifier.startsWith("+241"))
        return Promise.resolve({ ok: false, code: "CANAL_INDISPONIBLE" });
      // Même réponse avec ou sans compte
      pending = { email: identifier, firstName: FAKE_ACCOUNT.firstName };
      attempts = 0;
      return Promise.resolve(sent(identifier));
    },
    resendReset() {
      calls.push("resend-reset");
      attempts = 0;
      return Promise.resolve(pending ? sent(pending.email) : { ok: false, code: "CODE_EXPIRE" });
    },
    resetPassword(code, newPassword) {
      calls.push(`reset:${code}`);
      if (newPassword.length < 8)
        return Promise.resolve({ ok: false, code: "MOT_DE_PASSE_FAIBLE" });
      const error = checkCode(code);
      if (error) return Promise.resolve(error as SignedIn);
      pending = null;
      return Promise.resolve({ ok: true, account: FAKE_ACCOUNT });
    },
  };
}
