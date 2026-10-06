import { z } from "zod";

// Messages de validation en français
z.config(z.locales.fr());

/**
 * Configuration de l'API, lue UNE fois au démarrage depuis les variables d'environnement.
 * Si une valeur manque ou est invalide, l'API refuse de démarrer avec un message clair :
 * mieux vaut un conteneur qui ne démarre pas qu'une API qui tourne avec une configuration fausse.
 *
 * Aucune valeur n'est jamais affichée dans les messages d'erreur (elle pourrait être un secret).
 */

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

/**
 * Base locale lancée par `docker compose up -d db` (identifiants de développement, accessibles
 * seulement depuis le poste). Refusée en production : la vraie adresse vient du serveur.
 */
export const LOCAL_DATABASE_URL = "postgresql://kemdia:kemdia@localhost:5432/kemdia";

/** Liste séparée par des virgules → tableau sans éléments vides. */
const commaList = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["local", "demo", "staging", "production"]).default("local"),
    APP_VERSION: z
      .string()
      .regex(/^[\w.+-]{1,64}$/, "lettres, chiffres, « . », « - », « + » ou « _ » (64 au plus)")
      .default("dev"),
    HOST: z.string().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
    /** Origines autorisées à appeler l'API depuis un navigateur. Vide = aucune (le site appelle l'API côté serveur). */
    CORS_ORIGINS: commaList.pipe(z.array(z.url({ protocol: /^https?$/ }))),
    /** Nombre de relais (ex. Caddy = 1) dont on accepte l'en-tête X-Forwarded-For pour connaître l'adresse du client. */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    /** Adresse PostgreSQL. Contient un mot de passe : jamais journalisée, jamais affichée. */
    DATABASE_URL: z
      .url({ protocol: /^postgres(ql)?$/, error: "adresse postgresql://… attendue" })
      .default(LOCAL_DATABASE_URL),
    /** Connexions simultanées au plus (la démo gratuite de Render en accepte peu). */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    /** Une requête SQL plus longue est interrompue : protège la base d'une requête qui s'emballe. */
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(10_000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    // En production, l'image doit indiquer sa version (traçabilité, test de fumée du pipeline)
    if (env.APP_VERSION === "dev") {
      ctx.addIssue({ code: "custom", path: ["APP_VERSION"], message: "obligatoire en production" });
    }
    if (env.DATABASE_URL === LOCAL_DATABASE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "obligatoire en production (l'adresse de développement est refusée)",
      });
    }
    env.CORS_ORIGINS.forEach((origin, index) => {
      if (!origin.startsWith("https://")) {
        ctx.addIssue({
          code: "custom",
          path: ["CORS_ORIGINS", index],
          message: "HTTPS obligatoire en production",
        });
      }
    });
    if (env.LOG_LEVEL === "debug" || env.LOG_LEVEL === "trace") {
      ctx.addIssue({
        code: "custom",
        path: ["LOG_LEVEL"],
        message:
          "« debug » et « trace » sont interdits en production (risque de données personnelles dans les journaux)",
      });
    }
  });

export type AppConfig = Readonly<z.output<typeof envSchema>>;

/** Erreur de configuration : liste des variables en cause, sans leurs valeurs. */
export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(
      [
        "Configuration invalide : l'API ne peut pas démarrer.",
        ...problems.map((problem) => `  - ${problem}`),
        "Voir apps/api/.env.example pour la liste des variables.",
      ].join("\n"),
    );
    this.name = "ConfigError";
  }
}

/** Lit et valide la configuration. Lève une `ConfigError` au premier démarrage si elle est fausse. */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  // Une variable définie mais vide (« PORT= ») est traitée comme absente : la valeur par défaut s'applique.
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value.trim() !== ""),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const name =
        issue.path
          .map((part, index) =>
            typeof part === "number" ? `[${part}]` : `${index ? "." : ""}${String(part)}`,
          )
          .join("") || "(racine)";
      return `${name} : ${issue.message}`;
    });
    throw new ConfigError(problems);
  }
  return Object.freeze(result.data);
}
