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
  AdminAccountLookupRequestSchema,
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
import { RoleService } from "../application/role.service.js";
import type { AuthenticatedSession } from "../application/session.service.js";
import type { AdminAccountView } from "../domain/account.js";
import { withIdentityErrors } from "./identity-http-errors.js";
import { Authorize } from "./role.guard.js";
import { CurrentSession } from "./session.guard.js";

function presentAccount(account: AdminAccountView): AdminAccount {
  return { ...account, createdAt: account.createdAt.toISOString() };
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
 * - Réservé aux administrateurs, avec une connexion de moins de 15 minutes (`@Authorize`).
 * - Le rôle `admin` ne s'accorde jamais ici (commande serveur `admin:grant`) ; personne ne change ses propres rôles.
 * - Jamais mis en cache ; limite de 30 requêtes par minute.
 * - Les écrans d'administration du site arrivent au S6 avec la double authentification (MED-15).
 */
@Controller("admin")
@Authorize("admin", { recentLogin: true })
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class AdminController {
  constructor(
    private readonly roles: RoleService,
    private readonly audit: AuditReader,
  ) {}

  /** Retrouver un compte par e-mail ou téléphone (dans le corps : jamais dans l'adresse ni les journaux). */
  @Post("accounts/lookup")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async lookup(
    @Body({ schema: AdminAccountLookupRequestSchema }) body: AdminAccountLookupRequest,
  ): Promise<AdminAccount> {
    return presentAccount(await withIdentityErrors(() => this.roles.lookup(body.identifier)));
  }

  /** Accorde `vendor` ou `moderator`. Sans effet (et sans ligne de journal) si le compte l'a déjà. */
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

  /** Retire `vendor` ou `moderator`. Effet immédiat : les rôles sont relus à chaque requête. */
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
