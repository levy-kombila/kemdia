import { Injectable } from "@nestjs/common";
import type { Carrier } from "../application/ports.js";
import { MANUAL_CARRIER } from "../domain/shipment.js";

/**
 * Transporteur « manuel » (S7-T01, choix du 2026-10-17) : aucun échange automatique ; l'équipe prévient le livreur et
 * note chaque étape dans `/equipe`. Le vrai transporteur (question ouverte n° 5) remplacera cet adaptateur.
 */
@Injectable()
export class ManualCarrier implements Carrier {
  readonly name = MANUAL_CARRIER;

  handOver(): Promise<void> {
    return Promise.resolve();
  }
}
