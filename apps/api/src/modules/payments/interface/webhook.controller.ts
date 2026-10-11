import {
  BadRequestException,
  Controller,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import {
  PAYMENT_SIGNATURE_HEADER,
  PaymentNotificationSchema,
  type PaymentNotificationAck,
} from "@kemdia/contracts";
import { NotificationService } from "../application/notification.service.js";
import { withPaymentsErrors } from "./payments-http-errors.js";

/**
 * Notifications de l'opérateur Mobile Money (`POST /api/v1/webhooks/mobile-money`, S5-T05, ADR-0027).
 * Appelée par l'OPÉRATEUR, sans session ni clé interne : la seule preuve est la signature HMAC du corps brut
 * (en-tête `x-kemdia-signature`). La signature est vérifiée AVANT de lire le contenu : un appel non signé n'apprend rien.
 * 2xx = notification prise en compte (ou déjà reçue) ; sinon l'opérateur la renvoie.
 */
@Controller("webhooks/mobile-money")
// Un opérateur envoie ses notifications par rafales, depuis peu d'adresses : limite plus haute que les autres routes
@Throttle({ default: { limit: 600, ttl: 60_000 } })
export class WebhookController {
  constructor(private readonly notifications: NotificationService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers(PAYMENT_SIGNATURE_HEADER) signature: string | undefined,
  ): Promise<PaymentNotificationAck> {
    return withPaymentsErrors(async () => {
      this.notifications.authenticate(signature, req.rawBody);
      const parsed = PaymentNotificationSchema.safeParse(req.body);
      if (!parsed.success || (parsed.data.type === "payment.succeeded" && !parsed.data.amount)) {
        throw new BadRequestException("Notification invalide");
      }
      const { duplicate } = await this.notifications.receive(parsed.data);
      return { received: true, duplicate };
    });
  }
}
