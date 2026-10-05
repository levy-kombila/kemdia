/**
 * « Port » d'authentification (architecture hexagonale, voir docs/architecture/concepts.md §3).
 * Les formulaires ne connaissent que cette interface. Aujourd'hui : un adaptateur de DÉMONSTRATION
 * qui ne contacte aucun serveur et ne conserve rien. Au Sprint 4 : un adaptateur qui appelle l'API
 * NestJS (module identity) — sans modifier les formulaires.
 */
import { isValidOtp, type Identifier } from "./validation";

export type OtpPurpose = "signup" | "reset";

export type AuthResult =
  | { ok: true }
  | { ok: false; error: "invalid-code" | "too-many-attempts" | "expired" | "unavailable" };

export type SignupInput = {
  firstName: string;
  lastName: string;
  identifier: Identifier;
  password: string;
};

export interface AuthClient {
  /** Toujours « ok » côté interface, même si le compte n'existe pas (pas d'énumération des comptes). */
  login(identifier: Identifier, password: string): Promise<AuthResult>;
  signup(input: SignupInput): Promise<AuthResult>;
  requestPasswordReset(identifier: Identifier): Promise<AuthResult>;
  verifyOtp(purpose: OtpPurpose, identifier: Identifier, code: string): Promise<AuthResult>;
  resendOtp(purpose: OtpPurpose, identifier: Identifier): Promise<AuthResult>;
  resetPassword(identifier: Identifier, code: string, newPassword: string): Promise<AuthResult>;
}

export const DEMO_OTP = "123456";
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_DELAY_S = 60;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Adaptateur de démonstration : le code valable est toujours 123456, 5 essais maximum par code. */
export function createDemoAuthClient(latencyMs = 600): AuthClient {
  const attempts = new Map<string, number>();
  const key = (purpose: OtpPurpose, id: Identifier) => `${purpose}:${id.value}`;

  return {
    async login() {
      await wait(latencyMs);
      return { ok: false, error: "unavailable" };
    },
    async signup() {
      await wait(latencyMs);
      return { ok: true };
    },
    async requestPasswordReset() {
      await wait(latencyMs);
      return { ok: true };
    },
    async verifyOtp(purpose, identifier, code) {
      await wait(latencyMs);
      const k = key(purpose, identifier);
      const used = attempts.get(k) ?? 0;
      if (used >= OTP_MAX_ATTEMPTS) return { ok: false, error: "too-many-attempts" };
      if (isValidOtp(code) && code === DEMO_OTP) {
        attempts.delete(k);
        return { ok: true };
      }
      attempts.set(k, used + 1);
      return {
        ok: false,
        error: used + 1 >= OTP_MAX_ATTEMPTS ? "too-many-attempts" : "invalid-code",
      };
    },
    async resendOtp(purpose, identifier) {
      await wait(latencyMs);
      attempts.delete(key(purpose, identifier));
      return { ok: true };
    },
    async resetPassword() {
      await wait(latencyMs);
      return { ok: true };
    },
  };
}

export const authClient: AuthClient = createDemoAuthClient();
