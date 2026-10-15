import { Controller, Get, Header, Param, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import {
  InvoiceParamsSchema,
  OrderReferenceParamsSchema,
  type InvoiceList,
} from "@kemdia/contracts";
import { CurrentSession, SessionGuard, type AuthenticatedSession } from "../../identity/index.js";
import { InvoiceService } from "../application/invoice.service.js";
import { withPaymentsErrors } from "./payments-http-errors.js";

/**
 * Factures et avoirs d'une commande du compte connecté (`/api/v1/orders/{reference}/invoices`, S5-T06, ADR-0028).
 * Appelé par le serveur du site avec le jeton de session ; une commande d'un autre compte répond 404.
 */
@Controller("orders/:reference/invoices")
@UseGuards(SessionGuard)
export class InvoiceController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: OrderReferenceParamsSchema }) params: { reference: string },
  ): Promise<InvoiceList> {
    const items = await withPaymentsErrors(() =>
      this.invoices.listForAccount(session.account.id, params.reference),
    );
    return {
      items: items.map((i) => ({
        number: i.number,
        kind: i.kind,
        orderReference: i.orderReference,
        issuedAt: i.issuedAt.toISOString(),
        total: i.total,
      })),
    };
  }

  /** Le PDF (toujours le même pour un même numéro : refait à partir de la copie figée). */
  @Get(":number")
  async pdf(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: InvoiceParamsSchema }) params: { reference: string; number: string },
    @Res() res: Response,
  ): Promise<void> {
    const { invoice, pdf } = await withPaymentsErrors(() =>
      this.invoices.pdfForAccount(session.account.id, params.reference, params.number),
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
}
