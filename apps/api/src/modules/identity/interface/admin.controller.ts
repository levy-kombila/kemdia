import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import {
  AccountDisableRequestSchema,
  AccountIdParamsSchema,
  AdminAccountLookupRequestSchema,
  StaffListParamsSchema,
  STAFF_CURSOR_PATTERN,
  type AccountDisableRequest,
  type StaffActionResult,
  type StaffListParams,
  type StaffPage,
  AdminRoleParamsSchema,
  AuditQueryParamsSchema,
  type AdminAccount,
  type AdminAccountLookupRequest,
  type AdminRoleParams,
  type AuditPage,
  type AuditQueryParams,
} from "@kemdia/contracts";
import {
  AuditReader,
  auditContextOf,
  type AuditCursor,
  type AuditEvent,
} from "../../audit/index.js";
import type { StaffCursor } from "../application/ports.js";
import { RoleService } from "../application/role.service.js";
import { StaffAccountService } from "../application/staff-account.service.js";
import type { AuthenticatedSession } from "../application/session.service.js";
import type { AdminAccountView } from "../domain/account.js";
import { withIdentityErrors } from "./identity-http-errors.js";
import { Authorize } from "./role.guard.js";
import { AccountRateLimit, CurrentSession } from "./session.guard.js";

function presentAccount(account: AdminAccountView): AdminAccount {
  return { ...account, createdAt: account.createdAt.toISOString() };
}

function presentAction(result: {
  account: AdminAccountView;
  sessionsClosed: number;
}): StaffActionResult {
  return { account: presentAccount(result.account), sessionsClosed: result.sessionsClosed };
}

function actorOf(session: AuthenticatedSession) {
  return { accountId: session.account.id, roles: session.account.roles };
}

/** Position opaque dans la liste de l'équipe : nom, prénom, identifiant, en base64url. */
export function encodeStaffCursor(cursor: StaffCursor): string {
  return Buffer.from(JSON.stringify([cursor.lastName, cursor.firstName, cursor.id])).toString(
    "base64url",
  );
}

export function decodeStaffCursor(raw: string): StaffCursor {
  let parsed: unknown;
  try {
    parsed = STAFF_CURSOR_PATTERN.test(raw)
      ? JSON.parse(Buffer.from(raw, "base64url").toString("utf8"))
      : null;
  } catch {
    parsed = null;
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 3 ||
    !parsed.every((part) => typeof part === "string" && part.length <= 100) ||
    !UUID.test(parsed[2] as string)
  ) {
    throw new BadRequestException("Position de page invalide");
  }
  const [lastName, firstName, id] = parsed as [string, string, string];
  return { lastName, firstName, id };
}

function presentEvent(event: AuditEvent) {
  return {
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    action: event.action,
    actor: event.actor,
    target: event.target,
    details: { ...event.details },
    ip: event.context.ip,
    requestId: event.context.requestId,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Position opaque dans le journal : date + identifiant de la dernière ligne lue, en base64url. */
export function encodeCursor(event: AuditEvent): string {
  return Buffer.from(`${event.occurredAt.toISOString()}|${event.id}`).toString("base64url");
}

export function decodeCursor(raw: string): AuditCursor {
  const [iso, id, ...rest] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const occurredAt = new Date(iso ?? "");
  if (rest.length > 0 || !id || !UUID.test(id) || Number.isNaN(occurredAt.getTime())) {
    throw new BadRequestException("Position de page invalide");
  }
  return { occurredAt, id };
}

/**
 * Administration (S4-T06, ADR-0020) : rôles des comptes et lecture du journal d'audit.
 *
 * - Réservé aux administrateurs, avec une double authentification confirmée depuis moins de 15 minutes (S6-T03) (`@Authorize`).
 * - Le rôle `admin` ne s'accorde jamais ici (commande serveur `admin:grant`) ; personne ne change ses propres rôles.
 * - Jamais mis en cache ; limite de 30 requêtes par minute, par adresse ET par compte.
 * - Les écrans d'administration du site arrivent au S6 avec la double authentification (MED-15).
 */
@Controller("admin")
@Authorize("admin", { secondFactor: true })
@Throttle({ default: { limit: 30, ttl: 60_000 } })
// Aussi par compte (S4-T07) : la limite par adresse ne s'applique pas aux appels du site sans visiteur
@AccountRateLimit(30)
export class AdminController {
  constructor(
    private readonly roles: RoleService,
    private readonly audit: AuditReader,
    private readonly staff: StaffAccountService,
  ) {}

  /** Équipe Kemdia (écran Utilisateurs, S7.5-T04) : comptes qui ont au moins un rôle de l'équipe, par nom. */
  @Get("staff")
  @Header("Cache-Control", "no-store")
  async staffList(
    @Query({ schema: StaffListParamsSchema }) query: StaffListParams,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<StaffPage> {
    const page = await withIdentityErrors(() =>
      this.staff.list(actorOf(session), {
        role: query.role,
        limit: query.limit,
        after: query.after ? decodeStaffCursor(query.after) : undefined,
      }),
    );
    return {
      items: page.items.map((record) => ({
        ...presentAccount(record.account.adminView()),
        secondFactorEnabled: record.secondFactorEnabled,
        lastActiveAt: record.lastActiveAt.toISOString(),
      })),
      nextCursor: page.next ? encodeStaffCursor(page.next) : null,
    };
  }

  /** Départ d'un employé : tous ses rôles de l'équipe retirés et ses sessions fermées ; il redevient client. */
  @Post("accounts/:accountId/remove-staff")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async removeStaff(
    @Param({ schema: AccountIdParamsSchema }) params: { accountId: string },
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ): Promise<StaffActionResult> {
    return presentAction(
      await withIdentityErrors(() =>
        this.staff.removeStaff(actorOf(session), params.accountId, auditContextOf(req)),
      ),
    );
  }

  /** Désactivation : plus aucune connexion, sessions fermées tout de suite ; motif au journal d'audit. */
  @Post("accounts/:accountId/disable")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async disable(
    @Param({ schema: AccountIdParamsSchema }) params: { accountId: string },
    @Body({ schema: AccountDisableRequestSchema }) body: AccountDisableRequest,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ): Promise<StaffActionResult> {
    return presentAction(
      await withIdentityErrors(() =>
        this.staff.disable(actorOf(session), params.accountId, body.reason, auditContextOf(req)),
      ),
    );
  }

  /** Réactivation d'un compte désactivé (jamais d'un compte effacé). */
  @Post("accounts/:accountId/enable")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async enable(
    @Param({ schema: AccountIdParamsSchema }) params: { accountId: string },
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ): Promise<StaffActionResult> {
    return presentAction(
      await withIdentityErrors(() =>
        this.staff.enable(actorOf(session), params.accountId, auditContextOf(req)),
      ),
    );
  }

  /** Retrouver un compte par e-mail ou téléphone (dans le corps : jamais dans l'adresse ni les journaux). */
  @Post("accounts/lookup")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async lookup(
    @Body({ schema: AdminAccountLookupRequestSchema }) body: AdminAccountLookupRequest,
  ): Promise<AdminAccount> {
    return presentAccount(await withIdentityErrors(() => this.roles.lookup(body.identifier)));
  }

  /** Accorde `vendor` ou un rôle de l'équipe (jamais `admin`). Sans effet (et sans ligne de journal) si le compte l'a déjà. */
  @Put("accounts/:accountId/roles/:role")
  @Header("Cache-Control", "no-store")
  async grant(
    @Param({ schema: AdminRoleParamsSchema }) params: AdminRoleParams,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ): Promise<AdminAccount> {
    const actor = { accountId: session.account.id, roles: session.account.roles };
    return presentAccount(
      await withIdentityErrors(() =>
        this.roles.grant(actor, params.accountId, params.role, auditContextOf(req)),
      ),
    );
  }

  /** Retire `vendor` ou un rôle de l'équipe (jamais `admin`). Effet immédiat : les rôles sont relus à chaque requête. */
  @Delete("accounts/:accountId/roles/:role")
  @Header("Cache-Control", "no-store")
  async revoke(
    @Param({ schema: AdminRoleParamsSchema }) params: AdminRoleParams,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ): Promise<AdminAccount> {
    const actor = { accountId: session.account.id, roles: session.account.roles };
    return presentAccount(
      await withIdentityErrors(() =>
        this.roles.revoke(actor, params.accountId, params.role, auditContextOf(req)),
      ),
    );
  }

  /** Journal d'audit, du plus récent au plus ancien ; `nextCursor` → paramètre `before` de la page suivante. */
  @Get("audit")
  @Header("Cache-Control", "no-store")
  async auditLog(
    @Query({ schema: AuditQueryParamsSchema }) query: AuditQueryParams,
  ): Promise<AuditPage> {
    const events = await this.audit.list({
      limit: query.limit + 1,
      before: query.before ? decodeCursor(query.before) : undefined,
      action: query.action,
      accountId: query.accountId,
    });
    const page = events.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(presentEvent),
      nextCursor: events.length > query.limit && last ? encodeCursor(last) : null,
    };
  }
}
