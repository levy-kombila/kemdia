import { describe, expect, it } from "vitest";
import {
  FakeClock,
  InMemoryAccounts,
  InMemoryOtpChallenges,
  InMemorySessions,
  InMemorySignupTickets,
  RecordingOtpSender,
  fakeHasher,
  RecordingAudit,
  directTransactions,
} from "../../../../test/identity/in-memory.js";
import { Account } from "../domain/account.js";
import { requireIdentifier } from "../domain/identifier.js";
import { OTP_RESEND_DELAY_MS } from "../domain/otp.js";
import { SIGNUP_TICKET_TTL_MS } from "../domain/signup-ticket.js";
import { OtpService } from "./otp.service.js";
import { SessionService } from "./session.service.js";
import { SignupService } from "./signup.service.js";

const INPUT = {
  firstName: " Awa ",
  lastName: "Ndong",
  identifier: "Awa@Exemple.ga",
  password: "Mangue2026",
};
const EMAIL = requireIdentifier("awa@exemple.ga");

function setup() {
  const accounts = new InMemoryAccounts();
  const audit = new RecordingAudit();
  const tickets = new InMemorySignupTickets();
  const challenges = new InMemoryOtpChallenges();
  const sender = new RecordingOtpSender(["email"]);
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
  const sessions = new InMemorySessions();
  const service = new SignupService(
    accounts,
    tickets,
    fakeHasher,
    clock,
    otp,
    new SessionService(sessions, accounts, clock, audit, directTransactions),
  );
  const account = () => [...accounts.rows.values()][0];
  return { service, accounts, tickets, challenges, sender, clock, otp, account, sessions };
}

/** Compte déjà inscrit et vérifié. */
async function existingAccount(accounts: InMemoryAccounts, clock: FakeClock) {
  const account = Account.register({
    id: "11111111-1111-4111-8111-111111111111",
    firstName: "Awa",
    lastName: "Ndong",
    identifier: EMAIL,
    passwordHash: "hash:Mangue2026",
    now: clock.now(),
  });
  account.markVerified(EMAIL, clock.now());
  await accounts.save(account);
  return account;
}

describe("Inscription (FR-001, BR-041)", () => {
  it("envoie un code et renvoie un ticket ; AUCUN compte avant la vérification", async () => {
    const { service, sender, tickets, accounts } = setup();
    const started = await service.start(INPUT);
    expect(started).toMatchObject({
      channel: "email",
      sentTo: "aw•••@exemple.ga",
      resendInSeconds: 60,
    });
    expect(started.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(accounts.rows.size).toBe(0);
    expect(sender.sent).toEqual([expect.objectContaining({ kind: "code", to: "awa@exemple.ga" })]);
    // Le ticket porte l'inscription ; seule son empreinte est gardée
    expect(tickets.rows).toEqual([
      expect.objectContaining({
        destination: "awa@exemple.ga",
        registration: { firstName: "Awa", lastName: "Ndong", passwordHash: "hash:Mangue2026" },
      }),
    ]);
    expect(JSON.stringify(tickets.rows)).not.toContain(started.ticket);
  });

  it("le bon code avec le bon ticket crée le compte, déjà vérifié, et connecte le client", async () => {
    const { service, sender, account, tickets, sessions } = setup();
    const { ticket } = await service.start(INPUT);
    const opened = await service.verify(ticket, sender.lastCode(), "Chrome sur Android");
    expect(opened.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(opened.account).toMatchObject({ firstName: "Awa", email: "awa@exemple.ga" });
    expect(sessions.rows).toEqual([
      expect.objectContaining({ accountId: account()?.id, userAgent: "Chrome sur Android" }),
    ]);
    expect(JSON.stringify(sessions.rows)).not.toContain(opened.token);
    expect(account()).toMatchObject({
      status: "active",
      firstName: "Awa",
      email: "awa@exemple.ga",
      passwordHash: "hash:Mangue2026",
    });
    expect(account()?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(tickets.rows).toEqual([]);
    await expect(service.verify(ticket, sender.lastCode())).rejects.toMatchObject({
      code: "CODE_EXPIRE",
    });
  });

  it("mauvais code : refusé, aucun compte", async () => {
    const { service, accounts } = setup();
    const { ticket } = await service.start(INPUT);
    await expect(service.verify(ticket, "000000")).rejects.toMatchObject({ code: "CODE_INVALIDE" });
    expect(accounts.rows.size).toBe(0);
  });

  it("ticket inconnu, mal formé ou expiré", async () => {
    const { service, sender, clock } = setup();
    const { ticket } = await service.start(INPUT);
    await expect(service.verify("x".repeat(43), "123456")).rejects.toMatchObject({
      code: "CODE_EXPIRE",
    });
    await expect(service.verify("pas un ticket", "123456")).rejects.toMatchObject({
      code: "CODE_EXPIRE",
    });
    clock.advance(SIGNUP_TICKET_TTL_MS);
    await expect(service.verify(ticket, sender.lastCode())).rejects.toMatchObject({
      code: "CODE_EXPIRE",
    });
  });

  it("refuse les données invalides AVANT de consulter la base ; rien n'est envoyé", async () => {
    const { service, tickets, sender } = setup();
    await expect(service.start({ ...INPUT, identifier: "bonjour" })).rejects.toMatchObject({
      code: "IDENTIFIANT_INVALIDE",
    });
    await expect(service.start({ ...INPUT, firstName: "A" })).rejects.toMatchObject({
      code: "NOM_INVALIDE",
    });
    await expect(service.start({ ...INPUT, password: "azerty123" })).rejects.toMatchObject({
      code: "MOT_DE_PASSE_FAIBLE",
    });
    await expect(service.start({ ...INPUT, identifier: "077123456" })).rejects.toMatchObject({
      code: "CANAL_INDISPONIBLE",
    });
    expect(tickets.rows).toEqual([]);
    expect(sender.sent).toEqual([]);
  });

  it("renvoi : nouveau code, même ticket, l'ancien code ne vaut plus rien", async () => {
    const { service, sender, clock, account } = setup();
    const { ticket } = await service.start(INPUT);
    const first = sender.lastCode();
    clock.advance(OTP_RESEND_DELAY_MS);
    const again = await service.resend(ticket);
    expect(again.ticket).toBe(ticket);
    expect(sender.lastCode()).not.toBe(first);
    await expect(service.verify(ticket, first)).rejects.toMatchObject({ code: "CODE_INVALIDE" });
    await service.verify(ticket, sender.lastCode());
    expect(account()?.status).toBe("active");
  });

  describe("même adresse, deuxième inscription", () => {
    it("inscription en cours : la nouvelle remplace l'ancienne ; l'ancien ticket ne valide plus rien", async () => {
      const { service, sender, clock, account } = setup();
      const victim = await service.start(INPUT);
      clock.advance(OTP_RESEND_DELAY_MS);
      const other = await service.start({ ...INPUT, firstName: "Intrus", password: "Autre2026x" });
      expect(other.ticket).not.toBe(victim.ticket);
      // Le titulaire reçoit le code de la 2ᵉ inscription mais n'a pas son ticket : rien n'est créé
      await expect(service.verify(victim.ticket, sender.lastCode())).rejects.toMatchObject({
        code: "CODE_EXPIRE",
      });
      expect(account()).toBeUndefined();
    });

    it("refusée par les limites : rien n'est modifié, l'inscription en cours reste valable", async () => {
      const { service, sender, account } = setup();
      const victim = await service.start(INPUT);
      await expect(service.start({ ...INPUT, password: "Autre2026x" })).rejects.toMatchObject({
        code: "ENVOI_TROP_RAPPROCHE",
      });
      await service.verify(victim.ticket, sender.lastCode());
      expect(account()).toMatchObject({ status: "active", passwordHash: "hash:Mangue2026" });
    });

    it("compte existant : même réponse, alerte au titulaire, compte intact, ticket leurre inutile", async () => {
      const { service, accounts, sender, clock, account } = setup();
      await existingAccount(accounts, clock);
      const fresh = await setup().service.start(INPUT);

      const decoy = await service.start({ ...INPUT, firstName: "Intrus", password: "Autre2026x" });
      expect(Object.keys(decoy).sort()).toEqual(Object.keys(fresh).sort());
      expect({ ...decoy, ticket: "" }).toEqual({ ...fresh, ticket: "" });
      expect(sender.sent).toEqual([
        { kind: "signup-alert", channel: "email", to: "awa@exemple.ga" },
      ]);

      // Renvoi accepté sans rien envoyer (on ne harcèle pas le titulaire) ; vérification toujours refusée
      clock.advance(OTP_RESEND_DELAY_MS);
      await expect(service.resend(decoy.ticket)).resolves.toMatchObject({ ticket: decoy.ticket });
      expect(sender.sent).toHaveLength(1);
      await expect(service.verify(decoy.ticket, "000000")).rejects.toMatchObject({
        code: "CODE_INVALIDE",
      });
      expect(account()).toMatchObject({ firstName: "Awa", passwordHash: "hash:Mangue2026" });
    });

    it("ticket leurre : même un code juste ne valide rien", async () => {
      const { service, accounts, sender, clock, otp } = setup();
      const existing = await existingAccount(accounts, clock);
      const decoy = await service.start(INPUT);
      // Simule un code deviné : on force l'envoi d'un vrai code à la même adresse
      clock.advance(OTP_RESEND_DELAY_MS);
      await otp.issue("signup", EMAIL, "code");
      await expect(service.verify(decoy.ticket, sender.lastCode())).rejects.toMatchObject({
        code: "CODE_INVALIDE",
      });
      expect(accounts.rows.size).toBe(1);
      expect((await accounts.findById(existing.id))?.passwordHash).toBe("hash:Mangue2026");
    });

    it("compte créé entre-temps pour cette adresse : la vérification échoue proprement", async () => {
      const { service, accounts, sender, clock } = setup();
      const { ticket } = await service.start(INPUT);
      await existingAccount(accounts, clock);
      await expect(service.verify(ticket, sender.lastCode())).rejects.toMatchObject({
        code: "CODE_EXPIRE",
      });
      expect(accounts.rows.size).toBe(1);
    });
  });
});
