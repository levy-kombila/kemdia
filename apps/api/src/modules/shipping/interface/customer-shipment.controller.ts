import { Controller, Get, Header, Param, UseGuards } from "@nestjs/common";
import { OrderReferenceParamsSchema, type CustomerShipment } from "@kemdia/contracts";
import { CurrentSession, SessionGuard, type AuthenticatedSession } from "../../identity/index.js";
import { ShipmentService } from "../application/shipment.service.js";
import { withShippingErrors } from "./shipping-http-errors.js";
import { presentCustomerShipment } from "./shipping.presenter.js";

/**
 * Livraison d'une commande vue par son client (`GET /api/v1/orders/{n°}/shipment`, S7-T02, ADR-0041) : session
 * ouverte, seulement ses commandes. Jamais en cache.
 */
@Controller("orders")
@UseGuards(SessionGuard)
export class CustomerShipmentController {
  constructor(private readonly shipments: ShipmentService) {}

  @Get(":reference/shipment")
  @Header("Cache-Control", "no-store")
  async get(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: OrderReferenceParamsSchema }) params: { reference: string },
  ): Promise<CustomerShipment> {
    return presentCustomerShipment(
      await withShippingErrors(() =>
        this.shipments.getForAccount(session.account.id, params.reference),
      ),
    );
  }
}
