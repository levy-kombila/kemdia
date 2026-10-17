import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import {
  OrderReferenceParamsSchema,
  ShipmentCancelRequestSchema,
  ShipmentFailedRequestSchema,
  ShipmentListQuerySchema,
  type ReadyOrderList,
  type Shipment,
  type ShipmentCancelRequest,
  type ShipmentFailedRequest,
  type ShipmentList,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { ShipmentService } from "../application/shipment.service.js";
import type { ShipmentStatus } from "../domain/shipment.js";
import { withShippingErrors } from "./shipping-http-errors.js";
import { presentReady, presentShipment } from "./shipping.presenter.js";

type Ref = { reference: string };

/**
 * Suivi des livraisons (`/api/v1/admin/shipping/…`, S7-T01, ADR-0040) : administrateurs seulement (choix du
 * 2026-10-17), double authentification confirmée, chaque étape au journal d'audit. Les actions répétées ne changent
 * rien et renvoient l'expédition telle quelle.
 */
@Controller("admin/shipping")
@Authorize("admin", { secondFactor: true })
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@AccountRateLimit(60)
export class ShipmentController {
  constructor(private readonly shipments: ShipmentService) {}

  @Get("ready")
  @Header("Cache-Control", "no-store")
  async ready(): Promise<ReadyOrderList> {
    return { items: (await this.shipments.listReady()).map(presentReady) };
  }

  @Get("shipments")
  @Header("Cache-Control", "no-store")
  async list(
    @Query({ schema: ShipmentListQuerySchema }) query: { status: ShipmentStatus },
  ): Promise<ShipmentList> {
    return { items: (await this.shipments.list(query.status)).map(presentShipment) };
  }

  @Get("shipments/:reference")
  @Header("Cache-Control", "no-store")
  async get(@Param({ schema: OrderReferenceParamsSchema }) params: Ref): Promise<Shipment> {
    return presentShipment(await withShippingErrors(() => this.shipments.get(params.reference)));
  }

  @Post("shipments/:reference/hand-over")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async handOver(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: OrderReferenceParamsSchema }) params: Ref,
    @Req() req: Request,
  ): Promise<Shipment> {
    const { shipment } = await withShippingErrors(() =>
      this.shipments.handOver(session.account.id, params.reference, auditContextOf(req)),
    );
    return presentShipment(shipment);
  }

  @Post("shipments/:reference/delivered")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async delivered(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: OrderReferenceParamsSchema }) params: Ref,
    @Req() req: Request,
  ): Promise<Shipment> {
    const { shipment } = await withShippingErrors(() =>
      this.shipments.delivered(session.account.id, params.reference, auditContextOf(req)),
    );
    return presentShipment(shipment);
  }

  @Post("shipments/:reference/failed")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async failed(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: OrderReferenceParamsSchema }) params: Ref,
    @Body({ schema: ShipmentFailedRequestSchema }) body: ShipmentFailedRequest,
    @Req() req: Request,
  ): Promise<Shipment> {
    const { shipment } = await withShippingErrors(() =>
      this.shipments.failed(session.account.id, params.reference, body.reason, auditContextOf(req)),
    );
    return presentShipment(shipment);
  }

  @Post("shipments/:reference/retry")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async retry(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: OrderReferenceParamsSchema }) params: Ref,
    @Req() req: Request,
  ): Promise<Shipment> {
    const { shipment } = await withShippingErrors(() =>
      this.shipments.retry(session.account.id, params.reference, auditContextOf(req)),
    );
    return presentShipment(shipment);
  }

  @Post("shipments/:reference/cancel")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async cancel(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: OrderReferenceParamsSchema }) params: Ref,
    @Body({ schema: ShipmentCancelRequestSchema }) body: ShipmentCancelRequest,
    @Req() req: Request,
  ): Promise<Shipment> {
    const { shipment } = await withShippingErrors(() =>
      this.shipments.cancel(session.account.id, params.reference, body.note, auditContextOf(req)),
    );
    return presentShipment(shipment);
  }
}
