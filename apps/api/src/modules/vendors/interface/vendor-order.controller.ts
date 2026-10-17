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
import type { Request } from "express";
import {
  OrderReferenceParamsSchema,
  VendorOrderListParamsSchema,
  VendorOrderRefuseRequestSchema,
  type VendorOrder,
  type VendorOrderListParams,
  type VendorOrderPage,
  type VendorOrderRefuseRequest,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { withOrdersErrors } from "../../orders/index.js";
import { VendorOrderService } from "../application/vendor-order.service.js";
import {
  decodeVendorOrderCursor,
  presentVendorOrder,
  presentVendorOrderPage,
} from "./vendor-order.presenter.js";
import { withVendorsErrors } from "./vendors-http-errors.js";

type ReferenceParams = { reference: string };

/** Erreurs des deux modules : la boutique (vendors), puis la commande (orders). */
const withErrors = <T>(run: () => Promise<T>) => withVendorsErrors(() => withOrdersErrors(run));

/**
 * Commandes de la boutique du compte connecté (`/api/v1/vendors/orders`, S6-T07, ADR-0038 ; BR-013). Rôle « vendeur »
 * ET boutique active (vérifiée dans la transaction). Une commande sans produit de la boutique est introuvable (404).
 * Jamais mis en cache. Appelé par le serveur du site avec le jeton de session. Documentation : vendors.openapi.ts.
 */
@Controller("vendors/orders")
@Authorize("vendor")
@AccountRateLimit(60)
export class VendorOrderController {
  constructor(private readonly orders: VendorOrderService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @CurrentSession() session: AuthenticatedSession,
    @Query({ schema: VendorOrderListParamsSchema }) query: VendorOrderListParams,
  ): Promise<VendorOrderPage> {
    const before = query.before ? decodeVendorOrderCursor(query.before) : undefined;
    return presentVendorOrderPage(
      await withErrors(() =>
        this.orders.list(session.account.id, { view: query.status, limit: query.limit, before }),
      ),
    );
  }

  @Get(":reference")
  @Header("Cache-Control", "no-store")
  async get(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: OrderReferenceParamsSchema }) params: ReferenceParams,
  ): Promise<VendorOrder> {
    const { order, canDecide } = await withErrors(() =>
      this.orders.get(session.account.id, params.reference),
    );
    return presentVendorOrder(order, canDecide);
  }

  /** Accepte : quand toutes les boutiques ont accepté, la commande passe « en préparation ». */
  @Post(":reference/accept")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(30)
  async accept(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: OrderReferenceParamsSchema }) params: ReferenceParams,
    @Req() req: Request,
  ): Promise<VendorOrder> {
    const { order, canDecide } = await withErrors(() =>
      this.orders.accept(session.account.id, params.reference, auditContextOf(req)),
    );
    return presentVendorOrder(order, canDecide);
  }

  /** Refuse (motif obligatoire) : la commande ENTIÈRE est annulée. */
  @Post(":reference/refuse")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(30)
  async refuse(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: OrderReferenceParamsSchema }) params: ReferenceParams,
    @Body({ schema: VendorOrderRefuseRequestSchema }) body: VendorOrderRefuseRequest,
    @Req() req: Request,
  ): Promise<VendorOrder> {
    const { order, canDecide } = await withErrors(() =>
      this.orders.refuse(session.account.id, params.reference, body.reason, auditContextOf(req)),
    );
    return presentVendorOrder(order, canDecide);
  }
}
