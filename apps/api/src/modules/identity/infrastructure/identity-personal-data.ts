import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";

/** Rôles d'équipe : un tel compte ne s'efface pas lui-même (un administrateur retire d'abord ses rôles). */
const STAFF_ROLES = ["ADMIN", "CATALOG", "LOGISTICS", "FINANCE", "SUPPORT"] as const;

/** Compte proche de l'effacement pour inactivité (S7-T08) */
export interface InactiveAccount {
  id: string;
  firstName: string;
  email: string | null;
  phone: string | null;
}

/**
 * Données personnelles du module identity (S7-T08, ADR-0047) : copie pour le titulaire, ce qui empêche l'effacement,
 * effacement, et comptes inactifs. Tout passe par la transaction partagée (`TransactionContext`) : le module
 * `privacy` efface tous les modules ENSEMBLE ou pas du tout.
 */
@Injectable()
export class IdentityPersonalData {
  constructor(private readonly tx: TransactionContext) {}

  /**
   * Verrouille le compte jusqu'à la fin de la transaction (FOR UPDATE) et relit son activité ; `null` s'il n'existe pas
   * ou est déjà effacé. Un rôle accordé au même moment (verrou partagé, S4-T06) attend et voit le compte désactivé.
   */
  async lock(
    accountId: string,
  ): Promise<{ lastActiveAt: Date; inactivityNoticeAt: Date | null } | null> {
    const rows = await this.tx.db.$queryRaw<
      { lastActiveAt: Date; inactivityNoticeAt: Date | null }[]
    >`
      SELECT "last_active_at" AS "lastActiveAt", "inactivity_notice_at" AS "inactivityNoticeAt"
      FROM "identity"."accounts" WHERE "id" = ${accountId}::uuid AND "deleted_at" IS NULL FOR UPDATE`;
    return rows[0] ?? null;
  }

  async blockers(accountId: string): Promise<string[]> {
    const staff = await this.tx.db.accountRole.count({
      where: { accountId, role: { in: [...STAFF_ROLES] } },
    });
    return staff > 0 ? ["COMPTE_EQUIPE"] : [];
  }

  /** Copie lisible : jamais d'empreinte, de jeton, de secret TOTP ni de code de secours. */
  async export(accountId: string): Promise<Record<string, unknown>> {
    const db = this.tx.db;
    const account = await db.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        termsAcceptedAt: true,
        adultConfirmedAt: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });
    // L'une après l'autre : dans une transaction, une seule requête à la fois sur la connexion
    const roles = await db.accountRole.findMany({
      where: { accountId },
      select: { role: true, grantedAt: true },
    });
    const sessions = await db.session.findMany({
      where: { accountId },
      select: {
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
        userAgent: true,
      },
      orderBy: { createdAt: "desc" },
    });
    // Appareils reconnus (S7.5-T04) : jamais l'empreinte ni le jeton d'avis
    const known = await db.knownDevice.findMany({
      where: { accountId },
      select: { userAgent: true, createdAt: true, lastSeenAt: true },
      orderBy: { lastSeenAt: "desc" },
    });
    const factor = await db.secondFactor.findUnique({
      where: { accountId },
      select: { enabledAt: true },
    });
    // Photo de profil (S7.5-T08) : la photo elle-même (WebP, 256 Ko au plus) — droit d'accès et portabilité
    const avatar = await db.accountAvatar.findUnique({
      where: { accountId },
      select: { updatedAt: true, image: true },
    });
    return {
      compte: account,
      roles,
      appareils: sessions,
      appareilsReconnus: known,
      doubleAuthentification: {
        activee: Boolean(factor?.enabledAt),
        depuis: factor?.enabledAt ?? null,
      },
      photoDeProfil: avatar
        ? {
            presente: true,
            depuis: avatar.updatedAt,
            image: `data:image/webp;base64,${Buffer.from(avatar.image).toString("base64")}`,
          }
        : { presente: false, depuis: null, image: null },
    };
  }

  /**
   * Efface l'identité : nom remplacé, e-mail et téléphone retirés, compte désactivé et marqué effacé ; sessions, rôles,
   * double authentification, tickets, codes et compteurs d'essais supprimés. L'identifiant (UUID) reste : les commandes
   * et factures gardées pour la comptabilité y renvoient sans plus rien dire de la personne.
   */
  async erase(accountId: string, now: Date): Promise<void> {
    const db = this.tx.db;
    const account = await db.account.findUnique({
      where: { id: accountId },
      select: { email: true, phone: true },
    });
    if (!account) return;
    const identifiers = [account.email, account.phone].filter((v): v is string => v !== null);
    const lower = accountId.toLowerCase();
    await db.session.deleteMany({ where: { accountId } });
    await db.recoveryCode.deleteMany({ where: { accountId } });
    await db.secondFactor.deleteMany({ where: { accountId } });
    await db.accountRole.deleteMany({ where: { accountId } });
    // Appareils connus (S7.5-T04) : empreintes et liens « ce n'est pas moi » partent avec le compte
    await db.knownDevice.deleteMany({ where: { accountId } });
    // Photo de profil (S7.5-T08) : effacée avec le compte
    await db.accountAvatar.deleteMany({ where: { accountId } });
    await db.resetTicket.deleteMany({
      where: { OR: [{ accountId }, { destination: { in: identifiers } }] },
    });
    await db.signupTicket.deleteMany({ where: { destination: { in: identifiers } } });
    await db.otpChallenge.deleteMany({ where: { destination: { in: identifiers } } });
    await db.loginGuard.deleteMany({
      where: {
        identifier: {
          in: [...identifiers, `password:${lower}`, `delete:${lower}`, `2fa:${lower}`],
        },
      },
    });
    await db.account.update({
      where: { id: accountId },
      data: {
        firstName: "Compte",
        lastName: "supprimé",
        email: null,
        phone: null,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        status: "DISABLED",
        // Empreinte inutilisable (aucun mot de passe ne lui correspond) et sessions invalidées pour de bon
        passwordHash: "effacé",
        passwordVersion: { increment: 1 },
        inactivityNoticeAt: null,
        avatarVersion: null,
        deletedAt: now,
      },
    });
  }

  /** Comptes sans activité depuis `before`, pas encore prévenus (ni effacés, ni d'équipe). */
  inactiveToNotify(before: Date, limit: number): Promise<InactiveAccount[]> {
    return this.tx.db.account.findMany({
      where: {
        deletedAt: null,
        lastActiveAt: { lt: before },
        inactivityNoticeAt: null,
        roles: { none: { role: { in: [...STAFF_ROLES] } } },
      },
      select: { id: true, firstName: true, email: true, phone: true },
      orderBy: { lastActiveAt: "asc" },
      take: limit,
    });
  }

  /** Comptes prévenus avant `noticeBefore` et restés inactifs depuis : à effacer. */
  async noticedAndStillInactive(noticeBefore: Date, limit: number): Promise<string[]> {
    const rows = await this.tx.db.account.findMany({
      where: { deletedAt: null, inactivityNoticeAt: { lt: noticeBefore } },
      select: { id: true, lastActiveAt: true, inactivityNoticeAt: true },
      orderBy: { inactivityNoticeAt: "asc" },
      take: limit,
    });
    return rows
      .filter((r) => r.inactivityNoticeAt !== null && r.lastActiveAt < r.inactivityNoticeAt)
      .map((r) => r.id);
  }

  /**
   * Note l'avis, si le compte est TOUJOURS inactif depuis `before` et pas encore prévenu (une connexion entre la
   * lecture et l'écriture, ou une autre instance, l'emporte). `true` si l'avis est noté ici.
   */
  async markNotified(accountId: string, before: Date, now: Date): Promise<boolean> {
    const { count } = await this.tx.db.account.updateMany({
      where: {
        id: accountId,
        deletedAt: null,
        inactivityNoticeAt: null,
        lastActiveAt: { lt: before },
      },
      data: { inactivityNoticeAt: now },
    });
    return count === 1;
  }
}
