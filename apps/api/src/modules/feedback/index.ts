/**
 * Port public du module feedback (S8-T02, ADR-0057) : la SEULE porte d'entrée pour les autres modules (ADR-0006).
 */
export { FeedbackModule } from "./feedback.module.js";
/** Données personnelles du module : copie et effacement, pour le module privacy */
export { FeedbackPersonalData } from "./infrastructure/feedback-personal-data.js";
