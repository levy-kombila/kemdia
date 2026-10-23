import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { BusinessException } from "../../../http/business-exception.js";
import { AvatarService } from "../application/avatar.service.js";
import { withIdentityErrors } from "./identity-http-errors.js";
import type { AuthenticatedSession } from "../application/session.service.js";
import { AccountRateLimit, CurrentSession, SessionGuard } from "./session.guard.js";

/** Corps de l'envoi : le fichier, lu en binaire par le parseur dédié (configure-app.ts, `isImageUpload`). */
function uploadedBytes(req: Request): Uint8Array {
  const body: unknown = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new BusinessException(
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      "Envoyez le fichier de la photo lui-même, en JPEG, PNG ou WebP (en-tête Content-Type image/jpeg, image/png ou image/webp)",
      "PHOTO_INVALIDE",
    );
  }
  return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
}

/**
 * Photo de profil du compte connecté (`/api/v1/auth/avatar`, S7.5-T08, ADR-0055) : envoyer, voir, retirer. Visible
 * seulement par le titulaire (jamais d'identifiant dans l'adresse : c'est toujours SA photo).
 */
@Controller("auth/avatar")
@UseGuards(SessionGuard)
export class AvatarController {
  constructor(private readonly avatars: AvatarService) {}

  /** Remplace la photo (corps = le fichier) ; renvoie sa nouvelle version. Recadrage coûteux : 10 par minute. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(10)
  async upload(
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ): Promise<{ avatar: string }> {
    const bytes = uploadedBytes(req);
    return {
      avatar: await withIdentityErrors(() => this.avatars.upload(session.account.id, bytes)),
    };
  }

  /** La photo (WebP, 256 px). Gardée par le navigateur du titulaire seulement (`private`), revalidée par ETag. */
  @Get()
  @AccountRateLimit(120)
  async read(
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const avatar = await withIdentityErrors(() => this.avatars.read(session.account.id));
    const etag = `"${avatar.sha256.slice(0, 32)}"`;
    res.setHeader("Cache-Control", "private, no-cache");
    res.setHeader("ETag", etag);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Authorization");
    if (req.headers["if-none-match"] === etag) {
      res.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Content-Length", String(avatar.image.byteLength));
    res.status(HttpStatus.OK).end(Buffer.from(avatar.image));
  }

  /** Retire la photo : les initiales reviennent. */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(10)
  async remove(@CurrentSession() session: AuthenticatedSession): Promise<void> {
    await withIdentityErrors(() => this.avatars.remove(session.account.id));
  }
}
