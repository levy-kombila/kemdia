/**
 * Port public du module vendors : la SEULE porte d'entrée pour les autres modules (ADR-0006, règle 1).
 * S6-T01 : boutiques (demande, examen, rôle vendeur) ; S6-T02 : produits des vendeurs ; S6-T07 : commandes des
 * vendeurs. La suite du S6 (KYC, commissions) passera par ici.
 */
export { VendorsModule } from "./vendors.module.js";
export { ShopService } from "./application/shop.service.js";
export { VendorProductService } from "./application/vendor-product.service.js";
export { ProductModerationService } from "./application/product-moderation.service.js";
export { VendorOrderService } from "./application/vendor-order.service.js";
export type { Shop, ShopKind, ShopStatus } from "./domain/shop.js";
export { VendorsError, type VendorsErrorCode } from "./domain/vendors-error.js";
export { withVendorsErrors, VENDORS_ERROR_STATUS } from "./interface/vendors-http-errors.js";
