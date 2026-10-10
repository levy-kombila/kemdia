/**
 * Port public du module orders : la SEULE porte d'entrée pour les autres modules (ADR-0006, règle 1).
 * S5-T01 : panier serveur ; S5-T02 : commandes. Le module `payments` (S5-T04) y lira les commandes.
 */
export { OrdersModule } from "./orders.module.js";
export { CartService, type CartView, type CartLineView } from "./application/cart.service.js";
export { OrderService } from "./application/order.service.js";
export { OrdersError, type OrdersErrorCode } from "./domain/orders-error.js";
