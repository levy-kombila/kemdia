import {
  Body,
  Controller,
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
  BetaInvitationIdParamsSchema,
  BetaInvitationListParamsSchema,
  BetaInvitationRequestSchema,
  BetaSettingsRequestSchema,
  type BetaInvitation as BetaInvitationView,
  type BetaInvitationCreated,
  type BetaInvitationListParams,
  type BetaInvitationPage,
  type BetaInvitationRequest,
  type BetaSettings as BetaSettingsView,
  type BetaSettingsRequest,
  type BetaStatus,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import { BetaService } from "../application/beta.service.js";
import type { AuthenticatedSession } from "../application/session.service.js";
import type { BetaInvitationCursor } from "../application/ports.js";
import {
  invitationStatus,
  type BetaInvitation,
  type BetaSettings,
} from "../domain/beta-invitation.js";
import { withIdentityErrors } from "./identity-http-errors.js";
import { Authorize } from "./role.guard.js";
import { AccountRateLimit, CurrentSession } from "./session.guard.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function presentInvitation(invitation: BetaInvitation, now: Date): BetaInvitationView {
  return {
    id: invitation.id,
    identifier: invitation.identifier,
    kind: invitation.kind,
    status: invitationStatus(invitation, now),
    expiresAt: invitation.expiresAt.toISOString(),
    usedAt: invitation.usedAt?.toISOString() ?? null,
    createdAt: invitation.createdAt.toISOString(),
  };
}

function presentSettings(settings: BetaSettings): BetaSettingsView {
  return { closed: settings.closed, updatedAt: settings.updatedAt?.toISOString() ?? null };
}

/** Position opaque dans la liste : date et identifiant, en base64url. */
export function encodeInvitationCursor(cursor: BetaInvitationCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt.toISOString(), cursor.id])).toString(
    "base64url",
  );
}

export function decodeInvitationCursor(raw: string): BetaInvitationCursor | undefined {
  try {
    const value: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(value) || value.length !== 2) return undefined;
    const [date, id] = value as unknown[];
    if (typeof date !== "string" || typeof id !== "string" || !UUID.test(id)) return undefined;
    const createdAt = new Date(date);
    return Number.isNaN(createdAt.getTime()) ? undefined : { createdAt, id };
  } catch {
    return undefined;
  }
}

/** Public (`/api/v1/auth/beta`) : le site annonce la bêta fermée sur la page d'inscription (S8-T02). */
@Controller("auth/beta")
export class BetaStatusController {
  constructor(private readonly beta: BetaService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async status(): Promise<BetaStatus> {
    const { closed } = await this.beta.settings();
    return { closed };
  }
}

/** Bêta fermée (`/api/v1/admin/beta`) : administrateur avec la double authentification (S8-T02, ADR-0057). */
@Controller("admin/beta")
@Authorize("admin", { secondFactor: true })
// Même limite par visiteur que les autres routes d'administration (relecture de sécurité S8-T02)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class AdminBetaController {
  constructor(private readonly beta: BetaService) {}

  @Get("settings")
  @Header("Cache-Control", "no-store")
  async settings(): Promise<BetaSettingsView> {
    return presentSettings(await this.beta.settings());
  }

  @Put("settings")
  @Header("Cache-Control", "no-store")
  async updateSettings(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: BetaSettingsRequestSchema }) body: BetaSettingsRequest,
    @Req() req: Request,
  ): Promise<BetaSettingsView> {
    const saved = await this.beta.setClosed(session.account.id, body.closed, auditContextOf(req));
    return presentSettings(saved);
  }

  @Get("invitations")
  @Header("Cache-Control", "no-store")
  async invitations(
    @Query({ schema: BetaInvitationListParamsSchema }) query: BetaInvitationListParams,
  ): Promise<BetaInvitationPage> {
    const page = await this.beta.list(
      query.limit,
      query.after ? decodeInvitationCursor(query.after) : undefined,
    );
    const now = this.beta.now();
    return {
      items: page.items.map((i) => presentInvitation(i, now)),
      nextCursor: page.next ? encodeInvitationCursor(page.next) : null,
    };
  }

  /** Inviter une adresse, ou relancer son invitation (30 jours de plus). */
  @Post("invitations")
  @HttpCode(HttpStatus.CREATED)
  @AccountRateLimit(10)
  @Header("Cache-Control", "no-store")
  async invite(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: BetaInvitationRequestSchema }) body: BetaInvitationRequest,
    @Req() req: Request,
  ): Promise<BetaInvitationCreated> {
    const result = await withIdentityErrors(() =>
      this.beta.invite(session.account.id, body.identifier, body.kind, auditContextOf(req)),
    );
    return {
      invitation: presentInvitation(result.invitation, this.beta.now()),
      notified: result.notified,
    };
  }

  @Post("invitations/:invitationId/revoke")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async revoke(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: BetaInvitationIdParamsSchema }) params: { invitationId: string },
    @Req() req: Request,
  ): Promise<BetaInvitationView> {
    const invitation = await withIdentityErrors(() =>
      this.beta.revoke(session.account.id, params.invitationId, auditContextOf(req)),
    );
    return presentInvitation(invitation, this.beta.now());
  }
}
