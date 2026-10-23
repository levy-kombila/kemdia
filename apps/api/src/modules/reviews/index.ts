/**
 * Port public du module reviews (S8-T01, ADR-0056) : la SEULE porte d'entrée pour les autres modules (ADR-0006).
 */
export { ReviewsModule } from "./reviews.module.js";
/** Données personnelles du module : copie et effacement, pour le module privacy */
export { ReviewsPersonalData } from "./infrastructure/reviews-personal-data.js";
export { REVIEWS_ERROR_STATUS } from "./interface/reviews-http-errors.js";
