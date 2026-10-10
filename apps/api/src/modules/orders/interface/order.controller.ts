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
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  CreateOrderRequestSchema,
  OrderListParamsSchema,
  OrderQuoteRequestSchema,
  OrderReferenceParamsSchema,
  type CreateOrderRequest,
  type Order,
  type OrderListParams,
  type OrderPage,
  type OrderQuote,
  type OrderQuoteRequest,
} from "@kemdia/contracts";
import {
  AccountRateLimit,
  CurrentSession,
  SessionGuard,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { OrderService } from "../application/order.service.js";
import { decodeOrderCursor, presentOrder, presentPage } from "./order.presenter.js";
import { withOrdersErrors } from "./orders-http-errors.js";

/**
 * Commandes du compte connecté (`/api/v1/orders/…`, S5-T02, ADR-0024). Appelé par le SERVEUR du site avec le jeton de
 * session. Une commande se crée à partir du panier du compte : la requête ne contient ni article ni prix (BR-004).
 * Jamais mis en cache. Documentation : order.openapi.ts.
 */
@Controller("orders")
@UseGuards(SessionGuard)
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  /** Total du panier pour une ville (frais de livraison, paiement à la livraison possible ?), avant de commander. */
  @Post("quote")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  quote(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: OrderQuoteRequestSchema }) body: OrderQuoteRequest,
  ): Promise<OrderQuote> {
    return withOrdersErrors(() => this.orders.quote(session.account.id, body.cityId));
  }

  /** Crée la commande (201) ; la même clé renvoyée rend la commande déjà créée (200), jamais une deuxième. */
  @Post()
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(10)
  async create(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: CreateOrderRequestSchema }) body: CreateOrderRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Order> {
    const { order, created } = await withOrdersErrors(() =>
      this.orders.create(session.account.id, body),
    );
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return presentOrder(order);
  }

  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @CurrentSession() session: AuthenticatedSession,
    @Query({ schema: OrderListParamsSchema }) query: OrderListParams,
  ): Promise<OrderPage> {
    const before = query.before ? decodeOrderCursor(query.before) : undefined;
    return presentPage(await this.orders.list(session.account.id, query.limit, before));
  }

  @Get(":reference")
  @Header("Cache-Control", "no-store")
  async get(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: OrderReferenceParamsSchema }) params: { reference: string },
  ): Promise<Order> {
    return presentOrder(
      await withOrdersErrors(() => this.orders.get(session.account.id, params.reference)),
    );
  }

  /** Annulation par le client, avant l'expédition ; le stock est remis en vente. */
  @Post(":reference/cancel")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(10)
  async cancel(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: OrderReferenceParamsSchema }) params: { reference: string },
  ): Promise<Order> {
    return presentOrder(
      await withOrdersErrors(() => this.orders.cancel(session.account.id, params.reference)),
    );
  }
}
