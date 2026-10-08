/**
 * « Port » d'authentification (architecture hexagonale, voir docs/architecture/concepts.md §3).
 * Les formulaires ne connaissent que cette interface. Depuis le S4-T05, elle est branchée sur les
 * actions serveur du site, qui appellent l'API (module identity) : le navigateur ne voit jamais
 * ni le jeton de session ni les tickets (cookies `HttpOnly`). Les tests remplacent `authClient`.
 */
import {
  forgotPasswordAction,
  loginAction,
  resendResetAction,
  resendSignupAction,
  resetPasswordAction,
  signupAction,
  verifySignupAction,
} from "./actions";
import type { AccountSummary, AuthResult, CodeSent, SignupInput } from "./types";

export type { AccountSummary, AuthResult, CodeSent, SignupInput } from "./types";

export type SignedIn = AuthResult<{ account: AccountSummary }>;

export interface AuthClient {
  /** Réponse identique que l'identifiant ait un compte ou non (pas d'énumération des comptes). */
  login(identifier: string, password: string): Promise<SignedIn>;
  /** Même réponse si l'adresse a déjà un compte (son titulaire reçoit une alerte). */
  signup(input: SignupInput): Promise<AuthResult<CodeSent>>;
  /** Bon code : compte créé, vérifié, et client connecté. */
  verifySignup(code: string): Promise<SignedIn>;
  resendSignup(): Promise<AuthResult<CodeSent>>;
  /** Même réponse sans compte, mais rien n'est envoyé. */
  requestPasswordReset(identifier: string): Promise<AuthResult<CodeSent>>;
  resendReset(): Promise<AuthResult<CodeSent>>;
  /** Code + nouveau mot de passe : connecté ici, déconnecté partout ailleurs. */
  resetPassword(code: string, newPassword: string): Promise<SignedIn>;
}

export const OTP_MAX_ATTEMPTS = 5;

export const authClient: AuthClient = {
  login: loginAction,
  signup: signupAction,
  verifySignup: verifySignupAction,
  resendSignup: resendSignupAction,
  requestPasswordReset: forgotPasswordAction,
  resendReset: resendResetAction,
  resetPassword: resetPasswordAction,
};
