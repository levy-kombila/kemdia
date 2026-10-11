import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  SandboxDecisionRequestSchema,
  SandboxPaymentParamsSchema,
  type SandboxDecision,
  type SandboxDecisionRequest,
  type SandboxPaymentRequestPage,
} from "@kemdia/contracts";
import {
  AccountRateLimit,
  CurrentSession,
  SessionGuard,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { SANDBOX_OPERATOR, SandboxOperator } from "../infrastructure/sandbox-operator.js";
import { withPaymentsErrors } from "./payments-http-errors.js";

/**
 * Téléphone simulé du bac à sable (`/api/v1/sandbox/mobile-money/requests`, S5-T05, ADR-0027) — poste de
 * développement et démo seulement : ailleurs, 404. Le compte connecté voit SES demandes de paiement et les valide
 * (code PIN fictif) ou les refuse ; l'opérateur simulé envoie alors une notification signée à l'API.
 */
@Controller("sandbox/mobile-money/requests")
@UseGuards(SessionGuard)
export class SandboxController {
  constructor(@Inject(SANDBOX_OPERATOR) private readonly operator: SandboxOperator | null) {}

  private sandbox(): SandboxOperator {
    if (!this.operator) throw new NotFoundException("Bac à sable indisponible ici");
    return this.operator;
  }

  @Get()
  @Header("Cache-Control", "no-store")
  list(@CurrentSession() session: AuthenticatedSession): SandboxPaymentRequestPage {
    return {
      items: this.sandbox()
        .pendingFor(session.account.id)
        .map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    };
  }

  @Post(":paymentId")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(20)
  decide(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: SandboxPaymentParamsSchema }) params: { paymentId: string },
    @Body({ schema: SandboxDecisionRequestSchema }) body: SandboxDecisionRequest,
  ): Promise<SandboxDecision> {
    const operator = this.sandbox();
    return withPaymentsErrors(() =>
      operator.decide(session.account.id, params.paymentId.toLowerCase(), body.decision, body.pin),
    );
  }
}
