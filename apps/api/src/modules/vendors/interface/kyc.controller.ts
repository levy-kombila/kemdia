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
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import {
  AdminKycDocumentParamsSchema,
  KycDocumentParamsSchema,
  KycListParamsSchema,
  KycRequestSchema,
  ShopDecisionReasonSchema,
  ShopIdParamsSchema,
  type AdminKyc,
  type AdminKycPage,
  type KycDocumentKind,
  type KycListParams,
  type KycRequest,
  type ShopDecisionReason,
  type VendorKyc,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { BusinessException } from "../../../http/business-exception.js";
import { KycService } from "../application/kyc.service.js";
import {
  decodeKycCursor,
  encodeKycCursor,
  presentAdminKyc,
  presentKycSummary,
  presentVendorKyc,
} from "./kyc.presenter.js";
import { withVendorsErrors } from "./vendors-http-errors.js";

/** Corps de l'envoi : le fichier, lu en binaire par le parseur dédié (configure-app.ts, `isImageUpload`). */
function uploadedBytes(req: Request): Uint8Array {
  const body: unknown = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new BusinessException(
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      "Envoyez la photo elle-même, en JPEG, PNG ou WebP (en-tête Content-Type image/jpeg, image/png ou image/webp)",
      "FORMAT_IMAGE_INVALIDE",
    );
  }
  return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
}

/**
 * Dossier de vérification du vendeur connecté (`/api/v1/vendors/kyc`, S6-T08, ADR-0039 ; BR-024). Rôle vendeur et
 * boutique active. Les numéros et les photos ne sont jamais renvoyés au vendeur (4 derniers caractères seulement).
 */
@Controller("vendors/kyc")
@Authorize("vendor")
@AccountRateLimit(30)
export class VendorKycController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async mine(@CurrentSession() session: AuthenticatedSession): Promise<VendorKyc> {
    return presentVendorKyc(await withVendorsErrors(() => this.kyc.mine(session.account.id)));
  }

  /** Crée ou modifie le dossier : il repasse « en préparation ». */
  @Put()
  @Header("Cache-Control", "no-store")
  async save(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: KycRequestSchema }) body: KycRequest,
    @Req() req: Request,
  ): Promise<VendorKyc> {
    return presentVendorKyc(
      await withVendorsErrors(() => this.kyc.save(session.account.id, body, auditContextOf(req))),
    );
  }

  /** Photo (corps = le fichier) : réencodée en WebP sans métadonnées, puis chiffrée. Remplace la précédente. */
  @Post("documents/:kind")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(10)
  async document(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: KycDocumentParamsSchema }) params: { kind: KycDocumentKind },
    @Req() req: Request,
  ): Promise<VendorKyc> {
    const bytes = uploadedBytes(req);
    return presentVendorKyc(
      await withVendorsErrors(() =>
        this.kyc.addDocument(session.account.id, params.kind, bytes, auditContextOf(req)),
      ),
    );
  }

  /** Envoi à l'équipe Kemdia : toutes les photos demandées doivent être là. */
  @Post("submit")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async submit(
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ): Promise<VendorKyc> {
    return presentVendorKyc(
      await withVendorsErrors(() => this.kyc.submit(session.account.id, auditContextOf(req))),
    );
  }
}

/**
 * Examen des dossiers de vérification (`/api/v1/admin/kyc`, S6-T08). ADMINISTRATEUR seulement (pas modérateur),
 * double authentification confirmée, 30 requêtes par minute ; jamais mis en cache. Chaque dossier ouvert et chaque
 * photo regardée sont inscrits au journal d'audit.
 */
@Controller("admin/kyc")
@Authorize("admin", { secondFactor: true })
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@AccountRateLimit(30)
export class AdminKycController {
  constructor(private readonly kyc: KycService) {}

  /** Dossiers envoyés, du plus ancien envoi au plus récent (filtre par statut possible). */
  @Get()
  @Header("Cache-Control", "no-store")
  async list(@Query({ schema: KycListParamsSchema }) query: KycListParams): Promise<AdminKycPage> {
    // Un brouillon n'est jamais montré à l'équipe : filtre « draft » = liste vide
    const status = query.status;
    if (status === "draft") return { items: [], nextCursor: null };
    const page = await withVendorsErrors(() =>
      this.kyc.list({
        status,
        limit: query.limit,
        after: query.after ? decodeKycCursor(query.after) : undefined,
      }),
    );
    return {
      items: page.items.map(presentKycSummary),
      nextCursor: page.next ? encodeKycCursor(page.next) : null,
    };
  }

  @Get(":shopId")
  @Header("Cache-Control", "no-store")
  async get(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: ShopIdParamsSchema }) params: { shopId: string },
    @Req() req: Request,
  ): Promise<AdminKyc> {
    return presentAdminKyc(
      await withVendorsErrors(() =>
        this.kyc.get(session.account.id, params.shopId, auditContextOf(req)),
      ),
    );
  }

  /** Photo déchiffrée (WebP), jamais mise en cache, jamais interprétée autrement qu'une image. */
  @Get(":shopId/documents/:kind")
  async document(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: AdminKycDocumentParamsSchema })
    params: { shopId: string; kind: KycDocumentKind },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const bytes = await withVendorsErrors(() =>
      this.kyc.document(session.account.id, params.shopId, params.kind, auditContextOf(req)),
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Content-Length", String(bytes.byteLength));
    res.status(HttpStatus.OK).end(Buffer.from(bytes));
  }

  /** Valide (204) : les versements deviennent possibles (BR-024). */
  @Post(":shopId/approve")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header("Cache-Control", "no-store")
  async approve(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: ShopIdParamsSchema }) params: { shopId: string },
    @Req() req: Request,
  ): Promise<void> {
    await withVendorsErrors(() =>
      this.kyc.decide(session.account.id, params.shopId, "approve", null, auditContextOf(req)),
    );
  }

  /** Refuse (204), avec un motif montré au vendeur. */
  @Post(":shopId/reject")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header("Cache-Control", "no-store")
  async reject(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: ShopIdParamsSchema }) params: { shopId: string },
    @Body({ schema: ShopDecisionReasonSchema }) body: ShopDecisionReason,
    @Req() req: Request,
  ): Promise<void> {
    await withVendorsErrors(() =>
      this.kyc.decide(
        session.account.id,
        params.shopId,
        "reject",
        body.reason,
        auditContextOf(req),
      ),
    );
  }
}
