import { Injectable } from "@nestjs/common";
import type { OrderRecord } from "./ports.js";

/** Action d'un autre module quand le client annule sa commande, DANS la transaction de l'annulation. */
export type ClientCancelHook = (order: OrderRecord, now: Date) => Promise<void>;
/**
 * Action d'un autre module quand un VENDEUR fait annuler la commande (refus, ou pas de réponse à temps — S6-T07), DANS
 * la transaction de l'annulation. Une erreur annule tout (la commande reste ouverte).
 */
export type VendorCancelHook = (order: OrderRecord, now: Date) => Promise<void>;

/**
 * Ce qui doit suivre l'annulation d'une commande par son client (S5-T07, relecture de sécurité) : le module payments
 * s'inscrit ici au démarrage et expire les demandes de paiement encore en attente (sinon le client pourrait valider sur
 * son téléphone une commande déjà annulée, et être débité puis remboursé à la main). Le module orders ne dépend pas du
 * module payments (c'est l'inverse, ADR-0006) : il appelle ce qui s'est inscrit, sans le connaître.
 */
@Injectable()
export class OrderCancelHooks {
  private readonly hooks: ClientCancelHook[] = [];
  private readonly vendorHooks: VendorCancelHook[] = [];

  onClientCancel(hook: ClientCancelHook): void {
    this.hooks.push(hook);
  }

  /**
   * S6-T07 : le module payments s'inscrit ici pour qu'une commande payée puis refusée par un vendeur (ou sans réponse à
   * temps) soit remboursée (« à faire »), ses essais en attente expirés et sa facture annulée par un avoir.
   */
  onVendorCancel(hook: VendorCancelHook): void {
    this.vendorHooks.push(hook);
  }

  /** À appeler dans la transaction de l'annulation, commande verrouillée : une erreur annule tout. */
  async run(order: OrderRecord, now: Date): Promise<void> {
    for (const hook of this.hooks) await hook(order, now);
  }

  /** Annulation à cause d'un vendeur : dans sa transaction, commande verrouillée ; une erreur annule tout. */
  async runVendor(order: OrderRecord, now: Date): Promise<void> {
    for (const hook of this.vendorHooks) await hook(order, now);
  }
}
