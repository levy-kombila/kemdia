import { Injectable } from "@nestjs/common";
import { ZONES, type DeliveryTariffTable } from "@kemdia/contracts/delivery";

/** Lit le barème de livraison en vigueur, dans la transaction en cours s'il y en a une. */
export type DeliveryTariffSource = () => Promise<DeliveryTariffTable>;

/**
 * Barème de livraison des zones lu par le devis et la commande (S7-T01, ADR-0040). Le module shipping, qui garde le
 * barème réglé par un administrateur, s'inscrit ici au démarrage : le module orders ne dépend pas de lui (c'est
 * l'inverse, ADR-0006). Sans inscription (tests), barème par défaut du contrat.
 */
@Injectable()
export class DeliveryTariffs {
  private source: DeliveryTariffSource | null = null;

  use(source: DeliveryTariffSource): void {
    this.source = source;
  }

  current(): Promise<DeliveryTariffTable> {
    return this.source ? this.source() : Promise.resolve(ZONES);
  }
}
