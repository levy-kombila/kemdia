import { describe, expect, it } from "vitest";
import {
  FakeClock,
  InMemoryAccounts,
  InMemoryLoginGuards,
  InMemoryOtpChallenges,
  InMemoryResetTickets,
  InMemorySessions,
  RecordingOtpSender,
  fakeHasher,
} from "../../../../test/identity/in-memory.js";
import { Account } from "../domain/account.js";
import { requireIdentifier } from "../domain/identifier.js";
import { OTP_MAX_ATTEMPTS, OTP_RESEND_DELAY_MS } from "../domain/otp.js";
import { RESET_TICKET_TTL_MS } from "../domain/reset-ticket.js";
import { LoginService } from "./login.service.js";
import { OtpService } from "./otp.service.js";
import { PasswordResetService } from "./password-reset.service.js";
import { SessionService } from "./session.service.js";

const EMAIL = "awa@exemple.ga";
const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

async function setup({ status = "active" }: { status?: "active" | "disabled" } = {}) {
  const accounts = new InMemoryAccounts();

  const guards = new InMemoryLoginGuards();
  const challenges = new InMemoryOtpChallenges();
  const sessions = new InMemorySessions();
  const sender = new RecordingOtpSender(["email"]);
  const tickets = new InMemoryResetTickets(accounts, sessions, guards);
  const clock = new FakeClock();
  let n = 0;
  const otp = new OtpService(
    challenges,
    sender,
    clock,
    { smsEnabled: false },
    {
      int: () => 100_000 + ++n,
      uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    },
  );
  const sessionService = new SessionService(sessions, accounts, clock);
  const account = Account.register({
    id: ACCOUNT_ID,
    firstName: "Awa",
    lastName: "Ndong",
    identifier: requireIdentifier(EMAIL),
    passwordHash: "hash:Mangue2026",
    now: clock.now(),
  });
  account.markVerified(requireIdentifier(EMAIL), clock.now());
  await accounts.save(Account.restore({ ...account.snapshot(), status }));
  const service = new PasswordResetService(
    accounts,
    tickets,
    fakeHasher,
    clock,
    otp,
    sessionService,
  );
  const login = new LoginService(accounts, guards, fakeHasher, clock, sessionService);
  const stored = () => accounts.rows.get(ACCOUNT_ID)!;
  return {
    service,
    login,
    accounts,
    tickets,
    guards,
    sessions,
    sender,
    clock,
    stored,
    sessionService,
  };
}

const tryLogin = (login: LoginService, password: string) =>
  login.login({ identifier: EMAIL, password, userAgent: "Firefox" });

describe("Mot de passe oublié (FR-012)", () => {
  it("compte existant : code envoyé, ticket rendu, adresse masquée", async () => {
    const { service, sender, tickets } = await setup();
    const started = await service.start(" AWA@exemple.ga ");
    expect(started).toEqual({
      ticket: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as string,
      channel: "email",
      sentTo: expect.stringContaining("@exemple.ga") as string,
      resendInSeconds: OTP_RESEND_DELAY_MS / 1000,
    });
    expect(sender.sent).toEqual([
      expect.objectContaining({ kind: "code", purpose: "reset", to: EMAIL }),
    ]);
    expect(tickets.rows).toHaveLength(1);
    expect(tickets.rows[0]).toMatchObject({ destination: EMAIL, accountId: ACCOUNT_ID });
    expect(tickets.rows[0]!.ticketHash).not.toBe(started.ticket);
  });

  it("adresse sans compte : même forme de réponse, AUCUN e-mail, mêmes limites", async () => {
    const { service, sender, tickets } = await setup();
    const started = await service.start("inconnu@exemple.ga");
    expect(Object.keys(started).sort()).toEqual(
      ["channel", "resendInSeconds", "sentTo", "ticket"].sort(),
    );
    expect(sender.sent).toEqual([]);
    expect(tickets.rows[0]).toMatchObject({ accountId: null });
    // Les limites d'envoi s'appliquent aussi (sinon on saurait que le compte n'existe pas)
    await expect(service.start("inconnu@exemple.ga")).rejects.toMatchObject({
      code: "ENVOI_TROP_RAPPROCHE",
    });
    await expect(service.resend(started.ticket)).rejects.toMatchObject({
      code: "ENVOI_TROP_RAPPROCHE",
    });
  });

  it("compte désactivé : traité comme une adresse sans compte", async () => {
    const { service, sender, tickets } = await setup({ status: "disabled" });
    await service.start(EMAIL);
    expect(sender.sent).toEqual([]);
    expect(tickets.rows[0]).toMatchObject({ accountId: null });
  });

  it("bon code : mot de passe changé, connecté ici, déconnecté ailleurs, avis envoyé", async () => {
    const { service, login, sender, sessions, tickets, stored } = await setup();
    await tryLogin(login, "Mangue2026");
    const elsewhere = sessions.rows[0]!;
    const { ticket } = await service.start(EMAIL);
    const opened = await service.reset({
      ticket,
      code: sender.lastCode(),
      newPassword: "Papaye2027",
      userAgent: "Chrome",
    });
    expect(opened.account).toMatchObject({ id: ACCOUNT_ID, email: EMAIL });
    expect(stored().passwordHash).toBe("hash:Papaye2027");
    // L'ancienne session est fermée, la nouvelle est ouverte
    const old = sessions.rows.find((s) => s.id === elsewhere.id);
    expect(old?.revokedAt).not.toBeNull();
    expect(sessions.rows.filter((s) => s.revokedAt === null)).toHaveLength(1);
    expect(sessions.rows.at(-1)).toMatchObject({ userAgent: "Chrome", revokedAt: null });
    expect(sender.sent.at(-1)).toEqual({ kind: "password-changed", channel: "email", to: EMAIL });
    expect(tickets.rows).toEqual([]);
    // Ancien mot de passe refusé, nouveau accepté
    await expect(tryLogin(login, "Mangue2026")).rejects.toMatchObject({
      code: "IDENTIFIANTS_INCORRECTS",
    });
    await expect(tryLogin(login, "Papaye2027")).resolves.toBeDefined();
  });

  it("le ticket ne sert qu'une fois", async () => {
    const { service, sender } = await setup();
    const { ticket } = await service.start(EMAIL);
    const code = sender.lastCode();
    await service.reset({ ticket, code, newPassword: "Papaye2027" });
    await expect(service.reset({ ticket, code, newPassword: "Goyave2028" })).rejects.toMatchObject({
      code: "CODE_EXPIRE",
    });
  });

  it("lève le blocage après 3 erreurs (BR-040)", async () => {
    const { service, login, sender, guards } = await setup();
    for (const p of ["faux1", "faux2", "faux3"]) await tryLogin(login, p).catch(() => undefined);
    await expect(tryLogin(login, "Mangue2026")).rejects.toMatchObject({ code: "COMPTE_BLOQUE" });
    const { ticket } = await service.start(EMAIL);
    await service.reset({ ticket, code: sender.lastCode(), newPassword: "Papaye2027" });
    expect(guards.rows.size).toBe(0);
    await expect(tryLogin(login, "Papaye2027")).resolves.toBeDefined();
  });

  it("mot de passe trop faible : refusé AVANT le code, aucun essai perdu", async () => {
    const { service, sender } = await setup();
    const { ticket } = await service.start(EMAIL);
    const code = sender.lastCode();
    for (let i = 0; i < OTP_MAX_ATTEMPTS + 2; i++) {
      await expect(service.reset({ ticket, code, newPassword: "court" })).rejects.toMatchObject({
        code: "MOT_DE_PASSE_FAIBLE",
      });
    }
    await expect(service.reset({ ticket, code, newPassword: "Papaye2027" })).resolves.toBeDefined();
  });

  it("mauvais code : refusé, mot de passe inchangé, sessions intactes", async () => {
    const { service, login, sender, sessions, stored } = await setup();
    await tryLogin(login, "Mangue2026");
    const { ticket } = await service.start(EMAIL);
    const wrong = sender.lastCode() === "000000" ? "999999" : "000000";
    await expect(
      service.reset({ ticket, code: wrong, newPassword: "Papaye2027" }),
    ).rejects.toMatchObject({ code: "CODE_INVALIDE" });
    expect(stored().passwordHash).toBe("hash:Mangue2026");
    expect(sessions.rows.every((s) => s.revokedAt === null)).toBe(true);
  });

  it("ticket leurre (adresse sans compte) : aucun code ne marche", async () => {
    const { service, accounts } = await setup();
    const { ticket } = await service.start("inconnu@exemple.ga");
    // Aucun code n'a été envoyé ; on tente le code qu'aurait reçu le défi (n = 1 → 100001)
    await expect(
      service.reset({ ticket, code: "100001", newPassword: "Papaye2027" }),
    ).rejects.toMatchObject({ code: "CODE_INVALIDE" });
    expect(accounts.rows.size).toBe(1);
  });

  it("une nouvelle demande remplace l'ancienne", async () => {
    const { service, sender, clock } = await setup();
    const first = await service.start(EMAIL);
    clock.advance(OTP_RESEND_DELAY_MS);
    const second = await service.start(EMAIL);
    const code = sender.lastCode();
    await expect(
      service.reset({ ticket: first.ticket, code, newPassword: "Papaye2027" }),
    ).rejects.toMatchObject({ code: "CODE_EXPIRE" });
    await expect(
      service.reset({ ticket: second.ticket, code, newPassword: "Papaye2027" }),
    ).resolves.toBeDefined();
  });

  it("renvoi : nouveau code, le précédent ne marche plus", async () => {
    const { service, sender, clock } = await setup();
    const { ticket } = await service.start(EMAIL);
    const firstCode = sender.lastCode();
    clock.advance(OTP_RESEND_DELAY_MS);
    await service.resend(ticket);
    expect(sender.lastCode()).not.toBe(firstCode);
    await expect(
      service.reset({ ticket, code: firstCode, newPassword: "Papaye2027" }),
    ).rejects.toMatchObject({ code: "CODE_INVALIDE" });
    await expect(
      service.reset({ ticket, code: sender.lastCode(), newPassword: "Papaye2027" }),
    ).resolves.toBeDefined();
  });

  it("ticket expiré (1 h) ou mal formé : CODE_EXPIRE", async () => {
    const { service, sender, clock } = await setup();
    const { ticket } = await service.start(EMAIL);
    const code = sender.lastCode();
    clock.advance(RESET_TICKET_TTL_MS);
    await expect(service.reset({ ticket, code, newPassword: "Papaye2027" })).rejects.toMatchObject({
      code: "CODE_EXPIRE",
    });
    await expect(service.resend("pas-un-ticket")).rejects.toMatchObject({ code: "CODE_EXPIRE" });
  });

  it("compte désactivé entre la demande et le code : refusé", async () => {
    const { service, sender, accounts, stored } = await setup();
    const { ticket } = await service.start(EMAIL);
    await accounts.save(Account.restore({ ...stored(), status: "disabled" }));
    await expect(
      service.reset({ ticket, code: sender.lastCode(), newPassword: "Papaye2027" }),
    ).rejects.toMatchObject({ code: "CODE_INVALIDE" });
    expect(stored().passwordHash).toBe("hash:Mangue2026");
  });

  it("téléphone : bientôt disponible", async () => {
    const { service } = await setup();
    await expect(service.start("077 12 34 56")).rejects.toMatchObject({
      code: "CANAL_INDISPONIBLE",
    });
  });

  it("connexion commencée avec l'ancien mot de passe juste avant le changement : sa session est refusée", async () => {
    const { service, sender, accounts, sessionService } = await setup();
    const { ticket } = await service.start(EMAIL);
    // La connexion a lu le compte (et vérifié l'ancien mot de passe) AVANT le changement…
    const staleRead = Account.restore(accounts.rows.get(ACCOUNT_ID)!);
    await service.reset({ ticket, code: sender.lastCode(), newPassword: "Papaye2027" });
    // … et n'ouvre sa session qu'APRÈS : elle porte l'ancienne version, donc elle ne vaut rien
    const late = await sessionService.open(staleRead, "Attaquant");
    await expect(sessionService.authenticate(late.token)).rejects.toMatchObject({
      code: "SESSION_INVALIDE",
    });
  });

  it("l'adresse n'appartient plus au compte : refusé", async () => {
    const { service, sender, accounts, stored } = await setup();
    const { ticket } = await service.start(EMAIL);
    accounts.rows.set(ACCOUNT_ID, { ...stored(), email: "nouvelle@exemple.ga" });
    await expect(
      service.reset({ ticket, code: sender.lastCode(), newPassword: "Papaye2027" }),
    ).rejects.toMatchObject({ code: "CODE_INVALIDE" });
    expect(stored().passwordHash).toBe("hash:Mangue2026");
  });

  it("ticket leurre : un renvoi après 60 s n'envoie toujours rien", async () => {
    const { service, sender, clock } = await setup();
    const { ticket } = await service.start("inconnu@exemple.ga");
    clock.advance(OTP_RESEND_DELAY_MS);
    const again = await service.resend(ticket);
    expect(again.ticket).toBe(ticket);
    expect(sender.sent).toEqual([]);
  });

  it("mauvais codes : même suite d'erreurs avec ou sans compte", async () => {
    const { service } = await setup();
    const real = await service.start(EMAIL);
    const decoy = await service.start("inconnu@exemple.ga");
    const sequence = async (ticket: string) => {
      const codes: string[] = [];
      for (let i = 0; i < OTP_MAX_ATTEMPTS + 1; i++) {
        codes.push(
          await service.reset({ ticket, code: "000000", newPassword: "Papaye2027" }).then(
            () => "ok",
            (e: { code: string }) => e.code,
          ),
        );
      }
      return codes;
    };
    expect(await sequence(decoy.ticket)).toEqual(await sequence(real.ticket));
  });
});
