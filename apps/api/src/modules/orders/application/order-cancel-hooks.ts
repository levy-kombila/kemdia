import { Injectable } from "@nestjs/common";
import type { OrderRecord } from "./ports.js";

/** Action d'un autre module quand le client annule sa commande, DANS la transaction de l'annulation. */
export type ClientCancelHook = (order: OrderRecord, now: Date) => Promise<void>;

/**
 * Ce qui doit suivre l'annulation d'une commande par son client (S5-T07, relecture de sécurité) : le module payments
 * s'inscrit ici au démarrage et expire les demandes de paiement encore en attente (sinon le client pourrait valider sur
 * son téléphone une commande déjà annulée, et être débité puis remboursé à la main). Le module orders ne dépend pas du
 * module payments (c'est l'inverse, ADR-0006) : il appelle ce qui s'est inscrit, sans le connaître.
 */
@Injectable()
export class OrderCancelHooks {
  private readonly hooks: ClientCancelHook[] = [];

  onClientCancel(hook: ClientCancelHook): void {
    this.hooks.push(hook);
  }

  /** À appeler dans la transaction de l'annulation, commande verrouillée : une erreur annule tout. */
  async run(order: OrderRecord, now: Date): Promise<void> {
    for (const hook of this.hooks) await hook(order, now);
  }
}
