import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import {
  CorrectionCloseRequestSchema,
  CorrectionCreateRequestSchema,
  CorrectionIdParamsSchema,
  ListingCorrectionListParamsSchema,
  type CorrectionCloseRequest,
  type CorrectionCreateRequest,
  type ListingCorrection,
  type ListingCorrectionListParams,
  type ListingCorrectionPage,
  type VendorListing,
  AdminListingListParamsSchema,
  ListingIdParamsSchema,
  ListingImageParamsSchema,
  ListingMergeRequestSchema,
  ListingUpdateRequestSchema,
  OfferCreateRequestSchema,
  OfferWithdrawRequestSchema,
  VendorListingSearchParamsSchema,
  VendorProductIdParamsSchema,
  type AdminListing,
  type AdminListingDetail,
  type AdminListingListParams,
  type AdminListingPage,
  type ListingMergeRequest,
  type ListingMergeResult,
  type ListingUpdateRequest,
  type ModerationProduct,
  type OfferCreateRequest,
  type OfferWithdrawRequest,
  type VendorListingPage,
  type VendorListingSearchParams,
  type VendorProduct,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { ListingAdminService } from "../application/listing-admin.service.js";
import { VendorProductService } from "../application/vendor-product.service.js";
import {
  decodeProductCursor,
  encodeProductCursor,
  presentAdminListing,
  presentCorrection,
  presentModerationProduct,
  presentVendorListing,
  presentVendorProduct,
  statusFromApi,
} from "./vendor-product.presenter.js";
import { withVendorsErrors } from "./vendors-http-errors.js";

/**
 * Fiches communes, côté vendeur (`/api/v1/vendors/listings`, S7.5-T02, ADR-0049) : chercher une fiche en ligne et y
 * poser son offre. Rôle « vendeur » ET boutique active. Jamais mis en cache. Documentation : vendors.openapi.ts.
 */
@Controller("vendors/listings")
@Authorize("vendor")
@AccountRateLimit(60)
export class VendorListingController {
  constructor(private readonly products: VendorProductService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async search(
    @CurrentSession() session: AuthenticatedSession,
    @Query({ schema: VendorListingSearchParamsSchema }) query: VendorListingSearchParams,
  ): Promise<VendorListingPage> {
    const found = await withVendorsErrors(() =>
      this.products.searchListings(session.account.id, query.q, query.limit),
    );
    return {
      items: found.map(({ listing, myOfferId }) => presentVendorListing(listing, myOfferId)),
    };
  }

  /** Une fiche en ligne, avec l'offre de la boutique s'il y en a une (page « Vendre ce produit »). */
  @Get(":listingId")
  @Header("Cache-Control", "no-store")
  async get(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: ListingIdParamsSchema }) params: { listingId: string },
  ): Promise<VendorListing> {
    const { listing, myOfferId } = await withVendorsErrors(() =>
      this.products.publishedListing(session.account.id, params.listingId),
    );
    return presentVendorListing(listing, myOfferId);
  }

  /** Offre de la boutique sur une fiche en ligne (201) : en ligne tout de suite. */
  @Post(":listingId/offer")
  @Header("Cache-Control", "no-store")
  @AccountRateLimit(20)
  async createOffer(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: ListingIdParamsSchema }) params: { listingId: string },
    @Body({ schema: OfferCreateRequestSchema }) body: OfferCreateRequest,
    @Req() req: Request,
  ): Promise<VendorProduct> {
    return presentVendorProduct(
      await withVendorsErrors(() =>
        this.products.createOffer(
          session.account.id,
          params.listingId,
          body.variants,
          auditContextOf(req),
        ),
      ),
    );
  }
}

/**
 * Fiches communes, côté équipe (`/api/v1/moderation/listings` et `/api/v1/moderation/offers`, S7.5-T02). Modérateurs
 * et administrateurs, double authentification de moins de 15 minutes, 30 requêtes par minute ; jamais mis en cache ;
 * chaque écriture au journal d'audit.
 */
@Controller("moderation")
@Authorize("moderator", { secondFactor: true })
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@AccountRateLimit(30)
export class ListingAdminController {
  constructor(private readonly listings: ListingAdminService) {}

  @Get("listings")
  @Header("Cache-Control", "no-store")
  async list(
    @Query({ schema: AdminListingListParamsSchema }) query: AdminListingListParams,
  ): Promise<AdminListingPage> {
    const page = await withVendorsErrors(() =>
      this.listings.list({
        q: query.q,
        status: query.status ? statusFromApi(query.status) : undefined,
        limit: query.limit,
        after: query.after ? decodeProductCursor(query.after) : undefined,
      }),
    );
    return {
      items: page.items.map(presentAdminListing),
      nextCursor: page.next ? encodeProductCursor(page.next) : null,
    };
  }

  @Get("listings/:listingId")
  @Header("Cache-Control", "no-store")
  async get(
    @Param({ schema: ListingIdParamsSchema }) params: { listingId: string },
  ): Promise<AdminListingDetail> {
    const { listing, offers } = await withVendorsErrors(() => this.listings.get(params.listingId));
    return { listing: presentAdminListing(listing), offers: offers.map(presentModerationProduct) };
  }

  /** Correction de la fiche : recopiée sur toutes ses offres. */
  @Patch("listings/:listingId")
  @Header("Cache-Control", "no-store")
  async update(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: ListingIdParamsSchema }) params: { listingId: string },
    @Body({ schema: ListingUpdateRequestSchema }) body: ListingUpdateRequest,
    @Req() req: Request,
  ): Promise<AdminListing> {
    return presentAdminListing(
      await withVendorsErrors(() =>
        this.listings.edit(actorOf(session), params.listingId, body, auditContextOf(req)),
      ),
    );
  }

  @Delete("listings/:listingId/images/:imageId")
  @Header("Cache-Control", "no-store")
  async removeImage(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: ListingImageParamsSchema }) params: { listingId: string; imageId: string },
    @Req() req: Request,
  ): Promise<AdminListing> {
    return presentAdminListing(
      await withVendorsErrors(() =>
        this.listings.removeImage(
          actorOf(session),
          params.listingId,
          params.imageId,
          auditContextOf(req),
        ),
      ),
    );
  }

  /** Fusion d'un doublon (`listingId`) dans une fiche en ligne (`into`). */
  @Post("listings/:listingId/merge")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async merge(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: ListingIdParamsSchema }) params: { listingId: string },
    @Body({ schema: ListingMergeRequestSchema }) body: ListingMergeRequest,
    @Req() req: Request,
  ): Promise<ListingMergeResult> {
    const { target, moved } = await withVendorsErrors(() =>
      this.listings.merge(
        actorOf(session),
        params.listingId,
        body.into,
        body.variants,
        auditContextOf(req),
      ),
    );
    return { listing: presentAdminListing(target), moved };
  }

  /** Propositions de correction des vendeurs : ouvertes (par défaut) ou closes, d'une fiche ou de toutes. */
  @Get("listing-corrections")
  @Header("Cache-Control", "no-store")
  async corrections(
    @Query({ schema: ListingCorrectionListParamsSchema }) query: ListingCorrectionListParams,
  ): Promise<ListingCorrectionPage> {
    const page = await withVendorsErrors(() =>
      this.listings.corrections({
        open: query.status === "open",
        listingId: query.listingId,
        limit: query.limit,
        after: query.after ? decodeProductCursor(query.after) : undefined,
      }),
    );
    return {
      items: page.items.map(({ correction, shop }) => presentCorrection(correction, shop)),
      nextCursor: page.next ? encodeProductCursor(page.next) : null,
    };
  }

  /** Clôture d'une proposition, avec une réponse facultative montrée au vendeur. */
  @Post("listing-corrections/:correctionId/close")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async closeCorrection(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: CorrectionIdParamsSchema }) params: { correctionId: string },
    @Body({ schema: CorrectionCloseRequestSchema }) body: CorrectionCloseRequest,
    @Req() req: Request,
  ): Promise<ListingCorrection> {
    const { correction, shop } = await withVendorsErrors(() =>
      this.listings.closeCorrection(
        actorOf(session),
        params.correctionId,
        body.note ?? null,
        auditContextOf(req),
      ),
    );
    return presentCorrection(correction, shop);
  }

  /** Retrait d'une offre (prix abusif, contrefaçon…), avec un motif montré au vendeur. */
  @Post("offers/:productId/withdraw")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async withdraw(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: VendorProductIdParamsSchema }) params: { productId: string },
    @Body({ schema: OfferWithdrawRequestSchema }) body: OfferWithdrawRequest,
    @Req() req: Request,
  ): Promise<ModerationProduct> {
    return presentModerationProduct(
      await withVendorsErrors(() =>
        this.listings.withdrawOffer(
          actorOf(session),
          params.productId,
          body.reason,
          auditContextOf(req),
        ),
      ),
    );
  }
}

/**
 * Proposition de correction de la fiche d'une offre de la boutique (`/api/v1/vendors/products/{id}/corrections`,
 * S7.5-T03) : rôle « vendeur » ET boutique active ; tracée.
 */
@Controller("vendors/products")
@Authorize("vendor")
@AccountRateLimit(20)
export class VendorCorrectionController {
  constructor(private readonly products: VendorProductService) {}

  @Post(":productId/corrections")
  @Header("Cache-Control", "no-store")
  async propose(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: VendorProductIdParamsSchema }) params: { productId: string },
    @Body({ schema: CorrectionCreateRequestSchema }) body: CorrectionCreateRequest,
    @Req() req: Request,
  ): Promise<ListingCorrection> {
    const correction = await withVendorsErrors(() =>
      this.products.proposeCorrection(
        session.account.id,
        params.productId,
        body.message,
        auditContextOf(req),
      ),
    );
    return presentCorrection(correction, null);
  }
}

function actorOf(session: AuthenticatedSession) {
  return { accountId: session.account.id, roles: session.account.roles };
}
