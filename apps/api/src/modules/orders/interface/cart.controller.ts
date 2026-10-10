import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  CartAddRequestSchema,
  CartItemParamsSchema,
  CartMergeRequestSchema,
  CartQuantityRequestSchema,
  type Cart,
  type CartAddRequest,
  type CartMergeRequest,
  type CartMerged,
  type CartQuantityRequest,
} from "@kemdia/contracts";
import {
  AccountRateLimit,
  CurrentSession,
  SessionGuard,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { CartService } from "../application/cart.service.js";
import { withOrdersErrors } from "./orders-http-errors.js";

/**
 * Panier serveur du compte connecté (`/api/v1/cart/…`, S5-T01, ADR-0023). Appelé par le SERVEUR du site, avec le jeton
 * de session (`Authorization: Bearer`). Toutes les routes renvoient le panier complet, revérifié dans le catalogue.
 * Jamais mis en cache. Limite par compte : 120 requêtes par minute et par route (10 pour la réunion).
 * Documentation : cart.openapi.ts.
 */
@Controller("cart")
@UseGuards(SessionGuard)
export class CartController {
  constructor(private readonly carts: CartService) {}

  /** Le panier, vérifié ligne par ligne (BR-001) avec les prix actuels (BR-004) : sert au passage en caisse. */
  @Get()
  @Header("Cache-Control", "no-store")
  view(@CurrentSession() session: AuthenticatedSession): Promise<Cart> {
    return this.carts.view(session.account.id);
  }

  @Post("items")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  add(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: CartAddRequestSchema }) body: CartAddRequest,
  ): Promise<Cart> {
    return withOrdersErrors(() =>
      this.carts.add(session.account.id, body.variantId, body.quantity),
    );
  }

  @Put("items/:variantId")
  @Header("Cache-Control", "no-store")
  setQuantity(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: CartItemParamsSchema }) params: { variantId: string },
    @Body({ schema: CartQuantityRequestSchema }) body: CartQuantityRequest,
  ): Promise<Cart> {
    return withOrdersErrors(() =>
      this.carts.setQuantity(session.account.id, params.variantId, body.quantity),
    );
  }

  @Delete("items/:variantId")
  @Header("Cache-Control", "no-store")
  remove(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: CartItemParamsSchema }) params: { variantId: string },
  ): Promise<Cart> {
    return this.carts.remove(session.account.id, params.variantId);
  }

  @Delete()
  @Header("Cache-Control", "no-store")
  clear(@CurrentSession() session: AuthenticatedSession): Promise<Cart> {
    return this.carts.clear(session.account.id);
  }

  /** Juste après la connexion : le panier du navigateur rejoint celui du compte (quantités additionnées). */
  @Post("merge")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(10)
  merge(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: CartMergeRequestSchema }) body: CartMergeRequest,
  ): Promise<CartMerged> {
    return this.carts.merge(session.account.id, body.mergeId, body.lines);
  }
}
