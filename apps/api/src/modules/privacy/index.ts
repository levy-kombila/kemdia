/**
 * Port public du module privacy (S7-T08, ADR-0047). Seul le module racine l'importe : aucun module métier ne dépend
 * de privacy (c'est lui qui dépend d'eux).
 */
export { PrivacyModule } from "./privacy.module.js";
