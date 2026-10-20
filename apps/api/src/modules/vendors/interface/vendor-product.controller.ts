import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import {
  OfferLineSchema,
  type OfferLine,
  VendorProductContentRequestSchema,
  VendorProductCreateRequestSchema,
  VendorProductIdParamsSchema,
  VendorProductListParamsSchema,
  VendorVariantParamsSchema,
  VendorVariantUpdateRequestSchema,
  type VendorProduct,
  type VendorProductContentRequest,
  type VendorProductCreateRequest,
  type VendorProductListParams,
  type VendorProductPage,
  type VendorVariantUpdateRequest,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { VendorProductService } from "../application/vendor-product.service.js";
import {
  decodeProductCursor,
  encodeProductCursor,
  presentVendorProduct,
  statusFromApi,
} from "./vendor-product.presenter.js";
import { withVendorsErrors } from "./vendors-http-errors.js";

type ProductParams = { productId: string };
type VariantParams = { productId: string; variantId: string };

/**
 * Produits de la boutique du compte connecté (`/api/v1/vendors/products`, S6-T02, ADR-0033). Rôle « vendeur » ET
 * boutique active (vérifiée dans la transaction). Un produit d'une autre boutique est introuvable (404). Jamais mis en
 * cache. Appelé par le serveur du site avec le jeton de session. Documentation : vendors.openapi.ts.
 */
@Controller("vendors/products")
@Authorize("vendor")
@AccountRateLimit(60)
export class VendorProductController {
  constructor(private readonly products: VendorProductService) {}

  /** Crée un produit (201) : en attente de modération, invisible des clients jusqu'à sa validation (BR-003). */
  @Post()
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(20)
  async create(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: VendorProductCreateRequestSchema }) body: VendorProductCreateRequest,
    @Req() req: Request,
  ): Promise<VendorProduct> {
    return presentVendorProduct(
      await withVendorsErrors(() =>
        this.products.create(session.account.id, body, auditContextOf(req)),
      ),
    );
  }

  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @CurrentSession() session: AuthenticatedSession,
    @Query({ schema: VendorProductListParamsSchema }) query: VendorProductListParams,
  ): Promise<VendorProductPage> {
    const page = await withVendorsErrors(() =>
      this.products.list(session.account.id, {
        status: query.status ? statusFromApi(query.status) : undefined,
        limit: query.limit,
        after: query.after ? decodeProductCursor(query.after) : undefined,
      }),
    );
    return {
      items: page.items.map(presentVendorProduct),
      nextCursor: page.next ? encodeProductCursor(page.next) : null,
    };
  }

  @Get(":productId")
  @Header("Cache-Control", "no-store")
  async get(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: VendorProductIdParamsSchema }) params: ProductParams,
  ): Promise<VendorProduct> {
    return presentVendorProduct(
      await withVendorsErrors(() => this.products.get(session.account.id, params.productId)),
    );
  }

  /** Titre, description, marque, catégorie : le produit repasse en modération (caché en attendant). */
  @Put(":productId")
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(20)
  async updateContent(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: VendorProductIdParamsSchema }) params: ProductParams,
    @Body({ schema: VendorProductContentRequestSchema }) body: VendorProductContentRequest,
    @Req() req: Request,
  ): Promise<VendorProduct> {
    return presentVendorProduct(
      await withVendorsErrors(() =>
        this.products.updateContent(
          session.account.id,
          params.productId,
          body,
          auditContextOf(req),
        ),
      ),
    );
  }

  /** Prix, prix barré, stock (avec le stock lu avant), activation : sans nouvelle modération. */
  @Patch(":productId/variants/:variantId")
  @Header("Cache-Control", "no-store")
  async updateVariant(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: VendorVariantParamsSchema }) params: VariantParams,
    @Body({ schema: VendorVariantUpdateRequestSchema }) body: VendorVariantUpdateRequest,
    @Req() req: Request,
  ): Promise<VendorProduct> {
    return presentVendorProduct(
      await withVendorsErrors(() =>
        this.products.updateVariant(
          session.account.id,
          params.productId,
          params.variantId,
          body,
          auditContextOf(req),
        ),
      ),
    );
  }

  /** Ajoute à l'offre une déclinaison de sa fiche (201) : sans modération (S7.5-T02). */
  @Post(":productId/variants")
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(20)
  async addVariant(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: VendorProductIdParamsSchema }) params: ProductParams,
    @Body({ schema: OfferLineSchema }) body: OfferLine,
    @Req() req: Request,
  ): Promise<VendorProduct> {
    return presentVendorProduct(
      await withVendorsErrors(() =>
        this.products.addOfferVariant(
          session.account.id,
          params.productId,
          body,
          auditContextOf(req),
        ),
      ),
    );
  }

  /** Retire le produit de la vente (jamais supprimé : il peut figurer dans des commandes, BR-002). */
  @Post(":productId/archive")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async archive(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: VendorProductIdParamsSchema }) params: ProductParams,
    @Req() req: Request,
  ): Promise<VendorProduct> {
    return presentVendorProduct(
      await withVendorsErrors(() =>
        this.products.archive(session.account.id, params.productId, auditContextOf(req)),
      ),
    );
  }

  /** Remet en vente un produit archivé : nouvelle modération. */
  @Post(":productId/restore")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async restore(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: VendorProductIdParamsSchema }) params: ProductParams,
    @Req() req: Request,
  ): Promise<VendorProduct> {
    return presentVendorProduct(
      await withVendorsErrors(() =>
        this.products.restore(session.account.id, params.productId, auditContextOf(req)),
      ),
    );
  }
}
