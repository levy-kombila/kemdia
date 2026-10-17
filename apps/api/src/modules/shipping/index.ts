/**
 * Port public du module shipping (S7-T01, ADR-0040) : la SEULE porte d'entrée pour les autres modules (ADR-0006).
 * Aucun autre module ne l'appelle aujourd'hui ; l'application l'assemble.
 */
export { ShippingModule } from "./shipping.module.js";
