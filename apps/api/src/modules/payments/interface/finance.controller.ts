import {
  BadRequestException,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import {
  AdminInvoiceListParamsSchema,
  AdminInvoiceParamsSchema,
  type AdminInvoice,
  type AdminInvoiceListParams,
  type AdminInvoicePage,
  type CashToCollectList,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { emailStateOf, FinanceService } from "../application/finance.service.js";
import type { InvoiceRecord } from "../domain/invoice.js";
import { withPaymentsErrors } from "./payments-http-errors.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Position dans la liste : date d'émission et identifiant de la dernière facture, en base64url. */
export function encodeInvoiceCursor(next: { issuedAt: Date; id: string }): string {
  return Buffer.from(`${next.issuedAt.toISOString()}|${next.id}`).toString("base64url");
}

export function decodeInvoiceCursor(cursor: string): { issuedAt: Date; id: string } {
  const [at = "", id = "", ...rest] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (rest.length > 0 || !ISO.test(at) || !UUID.test(id) || Number.isNaN(Date.parse(at))) {
    throw new BadRequestException("Position de page invalide");
  }
  return { issuedAt: new Date(at), id };
}

function present(invoice: InvoiceRecord): AdminInvoice {
  return {
    number: invoice.number,
    kind: invoice.kind,
    orderReference: invoice.orderReference,
    issuedAt: invoice.issuedAt.toISOString(),
    total: invoice.total,
    buyerName: invoice.buyer.name,
    paymentMethod: invoice.paymentMethod,
    email: emailStateOf(invoice),
    emailSentAt: invoice.emailSentAt?.toISOString() ?? null,
  };
}

/**
 * Finance (`/api/v1/admin/invoices…`, `/api/v1/admin/cash-to-collect`, S7.5-T05, ADR-0052) : rôle « finance » (ou
 * administrateur) avec double authentification. Téléchargement et renvoi d'une facture inscrits au journal d'audit.
 */
@Controller("admin")
@Authorize("finance", { secondFactor: true })
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@AccountRateLimit(60)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get("invoices")
  @Header("Cache-Control", "no-store")
  async invoices(
    @Query({ schema: AdminInvoiceListParamsSchema }) query: AdminInvoiceListParams,
  ): Promise<AdminInvoicePage> {
    const after = query.after ? decodeInvoiceCursor(query.after) : undefined;
    const page = await this.finance.page(query.q, after);
    return {
      items: page.items.map(present),
      nextCursor: page.next ? encodeInvoiceCursor(page.next) : null,
    };
  }

  /** Le PDF, identique à celui du client (refait à partir de la copie figée). */
  @Get("invoices/:number")
  async pdf(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: AdminInvoiceParamsSchema }) params: { number: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { invoice, pdf } = await withPaymentsErrors(() =>
      this.finance.pdf(session.account.id, params.number, auditContextOf(req)),
    );
    res
      .status(200)
      .set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
        "Cache-Control": "no-store",
      })
      .send(Buffer.from(pdf));
  }

  @Post("invoices/:number/resend")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async resend(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: AdminInvoiceParamsSchema }) params: { number: string },
    @Req() req: Request,
  ): Promise<AdminInvoice> {
    return present(
      await withPaymentsErrors(() =>
        this.finance.resend(session.account.id, params.number, auditContextOf(req)),
      ),
    );
  }

  @Get("cash-to-collect")
  @Header("Cache-Control", "no-store")
  async cashToCollect(): Promise<CashToCollectList> {
    const orders = await this.finance.cashToCollect();
    return {
      items: orders.map((o) => ({
        reference: o.reference,
        status: o.status === "delivered" ? "delivered" : "shipped",
        total: o.total,
        cityName: o.delivery.cityName,
        createdAt: o.createdAt.toISOString(),
      })),
    };
  }
}
