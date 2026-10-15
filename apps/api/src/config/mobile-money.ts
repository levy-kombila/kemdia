/**
 * Où un paiement Mobile Money peut-il aboutir ? Règle unique, lue par deux modules (S5-T07, ADR-0029) :
 * - `payments` choisit son fournisseur (opérateur simulé ou aucun) ;
 * - `orders` ne propose Mobile Money (devis) et n'accepte une commande Mobile Money que si un fournisseur existe.
 *
 * Aujourd'hui, le seul fournisseur est l'opérateur simulé (S5-T05, ADR-0027) : poste de développement et démo,
 * jamais en préproduction ni en production, même si `NODE_ENV` est mal réglé. Le vrai fournisseur (question ouverte
 * n° 7 : agrégateur ou opérateurs) ajoutera sa condition ici.
 */
export interface MobileMoneyEnv {
  APP_ENV: string;
  NODE_ENV: string;
}

/** Opérateur simulé (bac à sable) actif. */
export function sandboxEnabled(env: MobileMoneyEnv): boolean {
  if (env.APP_ENV === "demo") return true;
  return env.APP_ENV === "local" && env.NODE_ENV !== "production";
}

/** Un paiement Mobile Money peut-il aboutir sur cet environnement ? */
export function mobileMoneyAvailable(env: MobileMoneyEnv): boolean {
  return sandboxEnabled(env);
}
