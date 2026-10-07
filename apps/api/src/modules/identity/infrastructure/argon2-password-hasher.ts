import { hash, verify } from "@node-rs/argon2";
import { Injectable } from "@nestjs/common";
import type { PasswordHasher } from "../application/ports.js";

/**
 * Argon2id (ADR-0015), réglages minimaux recommandés par l'OWASP : 19 Mio de mémoire, 2 passes, 1 fil.
 * ≈ 20-40 ms par hachage sur un petit serveur : supportable pour l'API, très coûteux pour un attaquant.
 * Les réglages sont écrits dans le hachage lui-même (« $argon2id$v=19$m=19456,t=2,p=1$… ») :
 * les augmenter plus tard n'empêche pas de vérifier les anciens mots de passe.
 */
export const ARGON2_OPTIONS = {
  // Algorithm.Argon2id (énumération « const » de la bibliothèque, inutilisable avec isolatedModules)
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      // Hachage illisible (donnée abîmée) : refus, jamais d'exception vers l'utilisateur
      return false;
    }
  }
}
