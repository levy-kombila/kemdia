import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import {
  DeleteAccountRequestSchema,
  type AccountDataExport,
  type AccountDeletionStatus,
  type DeleteAccountRequest,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  CurrentSession,
  SessionGuard,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { PrivacyService } from "../application/privacy.service.js";
import { withPrivacyErrors } from "./privacy-http-errors.js";

/**
 * Données personnelles du compte connecté (S7-T08, ADR-0047) : copie, possibilité de suppression, suppression.
 * Jamais mises en cache (`no-store`).
 */
@Controller("account")
@UseGuards(SessionGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  /** Copie de mes données (droit d'accès et portabilité) : fichier JSON à enregistrer. */
  @Get("data")
  @Header("Cache-Control", "no-store")
  @Header("Content-Disposition", 'attachment; filename="kemdia-mes-donnees.json"')
  // Lecture de tous les modules : 5 par minute et par compte suffisent largement
  @AccountRateLimit(5)
  async exportData(
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ): Promise<AccountDataExport> {
    return (await this.privacy.exportData(session, auditContextOf(req))) as AccountDataExport;
  }

  /** La suppression est-elle possible maintenant ? Sinon, pourquoi (commande en cours, boutique ouverte…). */
  @Get("deletion")
  @Header("Cache-Control", "no-store")
  async deletionStatus(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<AccountDeletionStatus> {
    const reasons = await this.privacy.deletionBlockers(session.account.id);
    return { possible: reasons.length === 0, reasons };
  }

  /** Supprimer mon compte (mot de passe actuel + case « définitif ») : effacement immédiat, 204. */
  @Post("delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header("Cache-Control", "no-store")
  // 5 par minute et par compte, en plus du blocage après 3 mots de passe faux
  @AccountRateLimit(5)
  async deleteAccount(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: DeleteAccountRequestSchema }) body: DeleteAccountRequest,
    @Req() req: Request,
  ): Promise<void> {
    await withPrivacyErrors(() =>
      this.privacy.deleteAccount({
        session,
        password: body.password,
        context: auditContextOf(req),
      }),
    );
  }
}
