import { Injectable, Logger } from "@nestjs/common";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { PrismaService } from "./prisma.service.js";

/**
 * Compteurs partagés (S8-T07, ADR-0064) : limites de débit, essais de coupons, renvois de factures, budget des
 * corrections de la recherche. En base (`platform.rate_counters`), ils valent pour TOUTES les instances de l'API ; en
 * mémoire (tests unitaires, `RATE_LIMIT_STORE=memory`), pour un seul processus.
 *
 * Fenêtre FIXE : le premier appel ouvre une fenêtre de `windowMs` ; les appels suivants s'y ajoutent ; après sa fin, on
 * repart de 1. Avec `block`, dépasser `limit` bloque la clé pendant `block.ms` : aucun appel n'est compté pendant le
 * blocage, et le premier appel après le blocage repart de 1 (comme le stockage en mémoire de @nestjs/throttler).
 */
export interface CounterState {
  /** Appels comptés dans la fenêtre en cours (le dernier compris). */
  hits: number;
  /** Fin de la fenêtre en cours. */
  resetAt: Date;
  /** Fin du blocage en cours, ou `null`. */
  blockedUntil: Date | null;
}

export interface RateCounters {
  /** Compte un appel et rend l'état après cet appel (une seule opération atomique). */
  hit(
    key: string,
    windowMs: number,
    now: Date,
    block?: { limit: number; ms: number },
  ): Promise<CounterState>;
  /** État en cours sans rien compter ; `null` si aucune fenêtre ni blocage en cours. */
  read(key: string, now: Date): Promise<CounterState | null>;
  /** Annule un appel compté (action finalement pas faite) ; jamais sous zéro. */
  undo(key: string, now: Date): Promise<void>;
  /** Efface les compteurs terminés ; rend leur nombre. */
  purge(now: Date): Promise<number>;
}

export const RATE_COUNTERS = Symbol("RateCounters");

/** Une clé reste lisible et bornée : jamais plus de 200 caractères (taille de la colonne). */
export const MAX_COUNTER_KEY_LENGTH = 200;

/** Mauvais usage des compteurs (erreur de programmation, jamais une panne de la base). */
export class InvalidCounterError extends Error {}

function checkKey(key: string): void {
  if (!key || key.length > MAX_COUNTER_KEY_LENGTH)
    throw new InvalidCounterError("clé de compteur invalide");
}

function checkWindow(windowMs: number, block?: { limit: number; ms: number }): void {
  if (!Number.isInteger(windowMs) || windowMs <= 0)
    throw new InvalidCounterError("fenêtre de compteur invalide");
  if (block && (!Number.isInteger(block.limit) || block.limit < 0 || block.ms < 0))
    throw new InvalidCounterError("blocage de compteur invalide");
}

interface MemoryEntry {
  hits: number;
  windowEndsAt: number;
  blockedUntil: number | null;
}

/** Compteurs d'un seul processus : tests unitaires et `RATE_LIMIT_STORE=memory` (une instance au plus). */
export class MemoryRateCounters implements RateCounters {
  private readonly entries = new Map<string, MemoryEntry>();

  hit(
    key: string,
    windowMs: number,
    now: Date,
    block?: { limit: number; ms: number },
  ): Promise<CounterState> {
    try {
      checkKey(key);
      checkWindow(windowMs, block);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error("compteur invalide"));
    }
    const t = now.getTime();
    const entry = this.entries.get(key);
    let next: MemoryEntry;
    if (
      entry?.blockedUntil !== undefined &&
      entry.blockedUntil !== null &&
      entry.blockedUntil > t
    ) {
      next = entry;
    } else if (!entry || entry.windowEndsAt <= t || entry.blockedUntil !== null) {
      // Fenêtre finie, ou blocage terminé : on repart de 1
      next = { hits: 1, windowEndsAt: t + windowMs, blockedUntil: null };
    } else {
      next = { hits: entry.hits + 1, windowEndsAt: entry.windowEndsAt, blockedUntil: null };
    }
    if (block && block.ms > 0 && next.blockedUntil === null && next.hits > block.limit) {
      next = { ...next, blockedUntil: t + block.ms };
    }
    this.entries.set(key, next);
    if (this.entries.size > 50_000) void this.purge(now);
    return Promise.resolve(stateOf(next));
  }

  read(key: string, now: Date): Promise<CounterState | null> {
    const entry = this.entries.get(key);
    return Promise.resolve(entry && alive(entry, now.getTime()) ? stateOf(entry) : null);
  }

  undo(key: string, now: Date): Promise<void> {
    const entry = this.entries.get(key);
    if (entry && entry.windowEndsAt > now.getTime())
      this.entries.set(key, { ...entry, hits: Math.max(0, entry.hits - 1) });
    return Promise.resolve();
  }

  purge(now: Date): Promise<number> {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (!alive(entry, now.getTime())) {
        this.entries.delete(key);
        removed++;
      }
    }
    return Promise.resolve(removed);
  }
}

function alive(entry: MemoryEntry, t: number): boolean {
  return entry.windowEndsAt > t || (entry.blockedUntil !== null && entry.blockedUntil > t);
}

function stateOf(entry: MemoryEntry): CounterState {
  return {
    hits: entry.hits,
    resetAt: new Date(entry.windowEndsAt),
    blockedUntil: entry.blockedUntil === null ? null : new Date(entry.blockedUntil),
  };
}

type CounterRow = { hits: number; window_ends_at: Date; blocked_until: Date | null };

/**
 * Compteurs en base, partagés par toutes les instances. `hit` est UNE requête (`INSERT … ON CONFLICT DO UPDATE`) :
 * deux instances qui comptent en même temps ne perdent aucun appel (verrou de ligne de PostgreSQL). Dans le `SET`,
 * chaque colonne `c.*` est la valeur AVANT la mise à jour. Requêtes paramétrées uniquement.
 */
@Injectable()
export class PostgresRateCounters implements RateCounters {
  constructor(private readonly prisma: PrismaService) {}

  async hit(
    key: string,
    windowMs: number,
    now: Date,
    block?: { limit: number; ms: number },
  ): Promise<CounterState> {
    checkKey(key);
    checkWindow(windowMs, block);
    const windowEnd = new Date(now.getTime() + windowMs);
    // Sans blocage : limite « infinie » (jamais dépassée)
    const limit = block && block.ms > 0 ? block.limit : 2_147_483_647;
    const blockEnd = new Date(now.getTime() + (block?.ms ?? 0));
    const rows = await this.prisma.$queryRaw<CounterRow[]>`
      INSERT INTO "platform"."rate_counters" AS c ("key", "hits", "window_ends_at", "blocked_until")
      VALUES (${key}, 1, ${windowEnd}, CASE WHEN 1 > ${limit}::int THEN ${blockEnd}::timestamptz END)
      ON CONFLICT ("key") DO UPDATE SET
        "hits" = CASE
          WHEN c."blocked_until" > ${now}::timestamptz THEN c."hits"
          WHEN c."window_ends_at" <= ${now}::timestamptz OR c."blocked_until" IS NOT NULL THEN 1
          ELSE c."hits" + 1 END,
        "window_ends_at" = CASE
          WHEN c."blocked_until" > ${now}::timestamptz THEN c."window_ends_at"
          WHEN c."window_ends_at" <= ${now}::timestamptz OR c."blocked_until" IS NOT NULL
            THEN ${windowEnd}::timestamptz
          ELSE c."window_ends_at" END,
        "blocked_until" = CASE
          WHEN c."blocked_until" > ${now}::timestamptz THEN c."blocked_until"
          WHEN (CASE WHEN c."window_ends_at" <= ${now}::timestamptz OR c."blocked_until" IS NOT NULL THEN 1
                     ELSE c."hits" + 1 END) > ${limit}::int
            THEN ${blockEnd}::timestamptz
          ELSE NULL END
      RETURNING "hits", "window_ends_at", "blocked_until"`;
    return toState(rows[0]!);
  }

  async read(key: string, now: Date): Promise<CounterState | null> {
    const rows = await this.prisma.$queryRaw<CounterRow[]>`
      SELECT "hits", "window_ends_at", "blocked_until" FROM "platform"."rate_counters"
      WHERE "key" = ${key}
        AND ("window_ends_at" > ${now}::timestamptz OR "blocked_until" > ${now}::timestamptz)`;
    return rows[0] ? toState(rows[0]) : null;
  }

  async undo(key: string, now: Date): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "platform"."rate_counters" SET "hits" = GREATEST("hits" - 1, 0)
      WHERE "key" = ${key} AND "window_ends_at" > ${now}::timestamptz`;
  }

  purge(now: Date): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM "platform"."rate_counters"
      WHERE "window_ends_at" <= ${now}::timestamptz
        AND ("blocked_until" IS NULL OR "blocked_until" <= ${now}::timestamptz)`;
  }
}

function toState(row: CounterRow): CounterState {
  return { hits: row.hits, resetAt: row.window_ends_at, blockedUntil: row.blocked_until };
}

/** Un avertissement par minute au plus pendant une panne (le journal ne déborde pas). */
const WARN_EVERY_MS = 60_000;
/** Au-delà, la base est jugée trop lente : repli en mémoire pour cet appel (relecture S8-T07). */
export const COUNTER_TIMEOUT_MS = 500;
/** Blocages connus de cette instance (relecture S8-T07) : bornés, pour ne pas grossir sans fin. */
const MAX_KNOWN_BLOCKS = 10_000;

/**
 * Compteurs en base avec repli (S8-T07) : si la base ne répond pas (panne, ou table pas encore créée entre le
 * déploiement de l'API et `db:deploy`), l'instance continue avec ses compteurs EN MÉMOIRE (les limites s'appliquent
 * alors par instance, comme avant S8-T07) au lieu de refuser toutes les requêtes. Avertissement dans le journal, sans
 * aucune valeur (ni clé, ni adresse).
 *
 * Contre la surcharge de la base (relecture S8-T07) : une clé que la base a déclarée BLOQUÉE n'est plus écrite par
 * cette instance jusqu'à la fin du blocage (une rafale d'un même attaquant ne coûte qu'une écriture), et un appel qui
 * dépasse `COUNTER_TIMEOUT_MS` passe au repli au lieu d'attendre une connexion libre.
 */
export class FallbackRateCounters implements RateCounters {
  private lastWarning = 0;
  private readonly blocked = new Map<string, CounterState>();

  constructor(
    private readonly primary: RateCounters,
    private readonly fallback: RateCounters = new MemoryRateCounters(),
    private readonly logger: Pick<Logger, "warn"> = new Logger("Compteurs partagés"),
    private readonly timeoutMs = COUNTER_TIMEOUT_MS,
  ) {}

  async hit(key: string, windowMs: number, now: Date, block?: { limit: number; ms: number }) {
    const known = this.blocked.get(key);
    if (known?.blockedUntil && known.blockedUntil > now) return known;
    if (known) this.blocked.delete(key);
    const state = await this.attempt(
      () => this.primary.hit(key, windowMs, now, block),
      () => this.fallback.hit(key, windowMs, now, block),
    );
    if (state.blockedUntil && state.blockedUntil > now) {
      if (this.blocked.size >= MAX_KNOWN_BLOCKS) {
        for (const [k, v] of this.blocked)
          if (!v.blockedUntil || v.blockedUntil <= now) this.blocked.delete(k);
        if (this.blocked.size >= MAX_KNOWN_BLOCKS) this.blocked.clear();
      }
      this.blocked.set(key, state);
    }
    return state;
  }

  read(key: string, now: Date) {
    return this.attempt(
      () => this.primary.read(key, now),
      () => this.fallback.read(key, now),
    );
  }

  undo(key: string, now: Date) {
    return this.attempt(
      () => this.primary.undo(key, now),
      () => this.fallback.undo(key, now),
    );
  }

  purge(now: Date) {
    return this.attempt(
      () => this.primary.purge(now),
      () => this.fallback.purge(now),
    );
  }

  private async attempt<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CounterTimeoutError()), this.timeoutMs);
        timer.unref();
      });
      return await Promise.race([primary(), timeout]);
    } catch (error) {
      // Une erreur de programmation (clé ou fenêtre invalide) n'est pas une panne : elle remonte
      if (error instanceof InvalidCounterError) throw error;
      const now = Date.now();
      if (now - this.lastWarning >= WARN_EVERY_MS) {
        this.lastWarning = now;
        this.logger.warn(
          `base injoignable pour les compteurs : repli en mémoire de cette instance (${error instanceof Error ? error.name : "erreur inconnue"})`,
        );
      }
      return fallback();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

class CounterTimeoutError extends Error {
  override readonly name = "CounterTimeoutError";
}

/** Choix du stockage : en base (avec repli) sauf `RATE_LIMIT_STORE=memory` (tests unitaires par défaut). */
export const rateCountersProvider = {
  provide: RATE_COUNTERS,
  inject: [APP_CONFIG, PrismaService],
  useFactory: (config: AppConfig, prisma: PrismaService): RateCounters =>
    config.RATE_LIMIT_STORE === "database"
      ? new FallbackRateCounters(new PostgresRateCounters(prisma))
      : new MemoryRateCounters(),
};
