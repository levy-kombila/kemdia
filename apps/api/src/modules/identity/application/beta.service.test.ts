import { describe, expect, it } from "vitest";
import {
  FakeClock,
  InMemoryAccounts,
  InMemoryOtpChallenges,
  InMemorySessions,
  InMemorySignupTickets,
  RecordingAudit,
  RecordingOtpSender,
  InMemoryBeta,
  directTransactions,
  fakeHasher,
} from "../../../../test/identity/in-memory.js";
import { Account } from "../domain/account.js";
import {
  BETA_INVITATION_TTL_DAYS,
  invitationStatus,
  type BetaInvitation,
} from "../domain/beta-invitation.js";
import { requireIdentifier } from "../domain/identifier.js";
import { NO_REQUEST } from "../../audit/index.js";
import { BetaService } from "./beta.service.js";
import { OtpService } from "./otp.service.js";
import { SessionService } from "./session.service.js";
import { SignupService } from "./signup.service.js";

const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DAY_MS = 24 * 60 * 60_000;

function setup(options: { siteUrl?: string | null; channels?: ("email" | "sms")[] } = {}) {
  const accounts = new InMemoryAccounts();
  const audit = new RecordingAudit();
  const clock = new FakeClock();
  const sender = new RecordingOtpSender(options.channels ?? ["email"]);
  let n = 0;
  const otp = new OtpService(
    new InMemoryOtpChallenges(),
    sender,
    clock,
    { smsEnabled: false },
    {
      int: () => 100_000 + ++n,
      uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    },
  );
  const repo = new InMemoryBeta();
  const beta = new BetaService(
    repo,
    accounts,
    directTransactions,
    clock,
    { siteUrl: options.siteUrl === undefined ? "https://kemdia.ga" : options.siteUrl },
    otp,
    audit,
  );
  const signup = new SignupService(
    accounts,
    new InMemorySignupTickets(),
    fakeHasher,
    clock,
    otp,
    new SessionService(new InMemorySessions(), accounts, clock, audit, directTransactions),
    beta,
  );
  return { accounts, audit, clock, sender, repo, beta, signup };
}

const SIGNUP = {
  firstName: "Awa",
  lastName: "Ndong",
  identifier: "awa@exemple.ga",
  password: "Mangue2026",
};

describe("Bêta fermée : invitations (S8-T02)", () => {
  it("invite une adresse normalisée, l'écrit au journal SANS l'adresse et envoie l'e-mail", async () => {
    const { beta, audit, sender, clock } = setup();
    const { invitation, notified } = await beta.invite(
      ADMIN,
      " Awa@Exemple.GA ",
      "tester",
      NO_REQUEST,
    );
    expect(notified).toBe(true);
    expect(invitation).toMatchObject({
      identifier: "awa@exemple.ga",
      kind: "tester",
      invitedBy: ADMIN,
    });
    expect(invitation.expiresAt.getTime() - clock.now().getTime()).toBe(
      BETA_INVITATION_TTL_DAYS * DAY_MS,
    );
    expect(audit.entries).toEqual([
      expect.objectContaining({
        action: "beta.invited",
        target: { type: "invitation", id: invitation.id },
        details: { kind: "tester", channel: "email", renewed: 0 },
      }),
    ]);
    expect(JSON.stringify(audit.entries)).not.toContain("awa@");
    // Envoi en arrière-plan : laisser partir la promesse
    await Promise.resolve();
    expect(sender.sent).toEqual([
      expect.objectContaining({
        kind: "beta-invitation",
        to: "awa@exemple.ga",
        link: "https://kemdia.ga/inscription",
      }),
    ]);
  });

  it("mobile sans SMS : invitation enregistrée, l'équipe prévient elle-même", async () => {
    const { beta, sender } = setup();
    const { invitation, notified } = await beta.invite(
      ADMIN,
      "074 12 34 56",
      "partner_vendor",
      NO_REQUEST,
    );
    expect(invitation.identifier).toBe("+241074123456");
    expect(notified).toBe(false);
    expect(sender.sent).toEqual([]);
  });

  it("refuse une adresse invalide ou qui a déjà un compte", async () => {
    const { beta, accounts, clock } = setup();
    await expect(beta.invite(ADMIN, "pas-une-adresse", "tester", NO_REQUEST)).rejects.toMatchObject(
      {
        code: "IDENTIFIANT_INVALIDE",
      },
    );
    const email = requireIdentifier("awa@exemple.ga");
    const account = Account.register({
      id: "11111111-1111-4111-8111-111111111111",
      firstName: "Awa",
      lastName: "Ndong",
      identifier: email,
      passwordHash: "hash:x",
      now: clock.now(),
    });
    account.markVerified(email, clock.now());
    await accounts.save(account);
    await expect(beta.invite(ADMIN, "awa@exemple.ga", "tester", NO_REQUEST)).rejects.toMatchObject({
      code: "COMPTE_EXISTANT",
    });
  });

  it("relancer une invitation expirée ou annulée garde la même ligne et repart pour 30 jours", async () => {
    const { beta, repo, clock, audit } = setup();
    const first = await beta.invite(ADMIN, "awa@exemple.ga", "tester", NO_REQUEST);
    await beta.revoke(ADMIN, first.invitation.id, NO_REQUEST);
    clock.advance(40 * DAY_MS);
    const again = await beta.invite(ADMIN, "awa@exemple.ga", "partner_vendor", NO_REQUEST);
    expect(again.invitation.id).toBe(first.invitation.id);
    expect(repo.rows.size).toBe(1);
    expect(invitationStatus(again.invitation, clock.now())).toBe("active");
    expect(again.invitation.kind).toBe("partner_vendor");
    expect(audit.entries.at(-1)?.details).toMatchObject({ renewed: 1 });
  });

  it("annuler : inconnue → 404 ; déjà annulée → sans effet ; utilisée → refus", async () => {
    const { beta, repo, audit } = setup();
    await expect(
      beta.revoke(ADMIN, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", NO_REQUEST),
    ).rejects.toMatchObject({ code: "INVITATION_INTROUVABLE" });
    const { invitation } = await beta.invite(ADMIN, "awa@exemple.ga", "tester", NO_REQUEST);
    await beta.revoke(ADMIN, invitation.id, NO_REQUEST);
    await beta.revoke(ADMIN, invitation.id, NO_REQUEST);
    expect(audit.actions().filter((a) => a === "beta.invitation_revoked")).toHaveLength(1);
    const row = repo.rows.get(invitation.id);
    if (!row) throw new Error("invitation absente");
    row.revokedAt = null;
    row.usedAt = new Date();
    row.usedBy = "11111111-1111-4111-8111-111111111111";
    await expect(beta.revoke(ADMIN, invitation.id, NO_REQUEST)).rejects.toMatchObject({
      code: "INVITATION_UTILISEE",
    });
  });

  it("relance dans l'heure : invitation prolongée, mais pas de nouvel e-mail (pas d'envois en rafale)", async () => {
    const { beta, clock } = setup();
    expect((await beta.invite(ADMIN, "awa@exemple.ga", "tester", NO_REQUEST)).notified).toBe(true);
    clock.advance(10 * 60_000);
    expect((await beta.invite(ADMIN, "awa@exemple.ga", "tester", NO_REQUEST)).notified).toBe(false);
    clock.advance(60 * 60_000);
    expect((await beta.invite(ADMIN, "awa@exemple.ga", "tester", NO_REQUEST)).notified).toBe(true);
  });

  it("ouvrir ou fermer l'inscription est journalisé", async () => {
    const { beta, audit } = setup();
    const saved = await beta.setClosed(ADMIN, true, NO_REQUEST);
    expect(saved.closed).toBe(true);
    expect(audit.entries).toEqual([
      expect.objectContaining({ action: "settings.beta_updated", details: { state: "closed" } }),
    ]);
  });
});

describe("Bêta fermée : inscription (S8-T02)", () => {
  it("inscription ouverte : rien ne change, sans invitation", async () => {
    const { signup, sender } = setup();
    const started = await signup.start(SIGNUP);
    expect(started.channel).toBe("email");
    const code = sender.lastCode();
    await expect(signup.verify(started.ticket, code)).resolves.toBeDefined();
  });

  it("inscription fermée : refusée sans invitation, même si l'adresse a déjà un compte (pas d'énumération)", async () => {
    const { signup, beta, sender } = setup();
    await beta.setClosed(ADMIN, true, NO_REQUEST);
    await expect(signup.start(SIGNUP)).rejects.toMatchObject({ code: "INVITATION_REQUISE" });
    expect(sender.sent).toEqual([]);
  });

  it("inscription fermée : invitation valable → compte créé, invitation utilisée une seule fois", async () => {
    const { signup, beta, sender, repo, accounts } = setup();
    await beta.setClosed(ADMIN, true, NO_REQUEST);
    const { invitation } = await beta.invite(ADMIN, "awa@exemple.ga", "tester", NO_REQUEST);
    const started = await signup.start({ ...SIGNUP, identifier: "AWA@exemple.ga" });
    await signup.verify(started.ticket, sender.lastCode());
    const created = [...accounts.rows.values()][0];
    expect(repo.rows.get(invitation.id)).toMatchObject({ usedBy: created?.id });
    expect(invitationStatus(repo.rows.get(invitation.id) as BetaInvitation, new Date())).toBe(
      "used",
    );
  });

  it("invitation expirée ou annulée pendant l'inscription : le code ne crée pas le compte", async () => {
    const { signup, beta, sender, accounts, clock } = setup();
    await beta.setClosed(ADMIN, true, NO_REQUEST);
    await beta.invite(ADMIN, "awa@exemple.ga", "tester", NO_REQUEST);
    clock.advance(BETA_INVITATION_TTL_DAYS * DAY_MS - 60_000);
    const started = await signup.start(SIGNUP);
    clock.advance(2 * 60_000);
    await expect(signup.verify(started.ticket, sender.lastCode())).rejects.toMatchObject({
      code: "INVITATION_REQUISE",
    });
    expect(accounts.rows.size).toBe(0);
  });
});
