/**
 * Port public du module orders : la SEULE porte d'entrée pour les autres modules (ADR-0006, règle 1).
 * S5-T01 : panier serveur ; S5-T02 : commandes. Le module `payments` (S5-T04) passe par `OrderPayments`.
 */
export { OrdersModule } from "./orders.module.js";
export { CartService, type CartView, type CartLineView } from "./application/cart.service.js";
export { OrderService } from "./application/order.service.js";
export { OrderPayments } from "./application/order-payments.service.js";
export { OrderCancelHooks } from "./application/order-cancel-hooks.js";
export type { OrderRecord } from "./application/ports.js";
export { validatePayment, type PaymentMethod } from "./domain/order.js";
export { withOrdersErrors, ORDERS_ERROR_STATUS } from "./interface/orders-http-errors.js";
export { presentOrder } from "./interface/order.presenter.js";
export { OrdersError, type OrdersErrorCode } from "./domain/orders-error.js";
