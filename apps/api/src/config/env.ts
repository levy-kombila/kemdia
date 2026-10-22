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
    /** Requêtes par minute et par adresse IP (limitation de débit). */
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(10_000).default(120),
    /**
     * Clé secrète du site Kemdia (en-tête `X-Kemdia-Internal-Key`) : le serveur du site appelle l'API pour
     * tous les visiteurs depuis une seule adresse, il est donc exempté de la limite par adresse. Facultative.
     */
    API_INTERNAL_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{32,128}$/, "32 à 128 caractères parmi A-Z, a-z, 0-9, « - » et « _ »")
      .optional(),
    /** Documentation interactive (/api/docs) et description OpenAPI. Par défaut : activée sauf en production. */
    API_DOCS: z.enum(["true", "false"]).optional(),
    /**
     * Clé de chiffrement des secrets de la double authentification (S6-T03, ADR-0034) : 32 octets en base64url
     * (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`). Secrète, jamais affichée.
     * Absente : clé de développement en local et en démo ; double authentification indisponible ailleurs (les routes
     * d'équipe restent alors fermées).
     */
    TOTP_ENCRYPTION_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/, "32 octets en base64url attendus (43 caractères)")
      .optional(),
    /**
     * Clé de chiffrement des dossiers de vérification des vendeurs (S6-T08, ADR-0039) : 32 octets en base64url, comme
     * `TOTP_ENCRYPTION_KEY` mais DIFFÉRENTE. Chiffre les numéros de pièce, les comptes de versement et les photos.
     * Absente : clé de développement en local SEULEMENT ; ailleurs (démo comprise : de vraies pièces d'identité
     * peuvent y être envoyées), la vérification est indisponible (`KYC_INDISPONIBLE`).
     */
    KYC_ENCRYPTION_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/, "32 octets en base64url attendus (43 caractères)")
      .optional(),
    /**
     * Vérification par SMS (S4, ADR-0015). `false` tant que le client n'a pas choisi de fournisseur :
     * le site affiche l'option téléphone comme « bientôt disponible » et l'API refuse d'envoyer un SMS.
     */
    SMS_ENABLED: z.enum(["true", "false"]).default("false"),
    /**
     * Envoi des e-mails (codes, alertes — ADR-0016) :
     * - `console` : écrits dans le terminal (poste de développement SEULEMENT) ;
     * - `mailpit` : boîte de test locale (docker compose), http://localhost:8025 ;
     * - `brevo`   : vrai envoi par l'API de Brevo (démo) ;
     * - `none`    : aucun envoi possible.
     * Par défaut : `console` sur le poste, `none` ailleurs.
     */
    EMAIL_TRANSPORT: z.enum(["console", "mailpit", "brevo", "none"]).optional(),
    /**
     * Adresse publique du site (S7.5-T04), pour le lien « ce n'est pas moi » des avis de nouvel appareil. Absente :
     * l'avis part sans lien et renvoie vers « Mot de passe oublié ». HTTPS obligatoire hors du poste.
     */
    PUBLIC_SITE_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** Adresse de Mailpit (API d'envoi). */
    MAILPIT_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:8025"),
    /** Clé d'API Brevo. SECRET : uniquement dans les variables du serveur, jamais dans Git ni dans un message. */
    BREVO_API_KEY: z
      .string()
      .regex(/^xkeysib-[A-Za-z0-9-]{20,200}$/, "clé Brevo attendue (commence par « xkeysib- »)")
      .optional(),
    /** Adresse d'expédition (pour Brevo : l'adresse vérifiée dans le compte Brevo). */
    EMAIL_FROM: z.email({ error: "adresse e-mail attendue" }).optional(),
    EMAIL_FROM_NAME: z
      .string()
      .regex(/^[\p{L}\p{N} .'-]{1,40}$/u, "40 caractères au plus : lettres, chiffres, espaces")
      .default("Kemdia"),
  })
  .superRefine((env, ctx) => {
    // Deux clés différentes (relecture S6-T08) : la fuite de l'une ne livre pas les données de l'autre
    if (env.KYC_ENCRYPTION_KEY && env.KYC_ENCRYPTION_KEY === env.TOTP_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["KYC_ENCRYPTION_KEY"],
        message: "doit être différente de TOTP_ENCRYPTION_KEY",
      });
    }
    const transport = env.EMAIL_TRANSPORT;
    const onDevMachine = env.APP_ENV === "local" && env.NODE_ENV !== "production";
    if (transport === "console" && !onDevMachine) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_TRANSPORT"],
        message:
          "« console » est réservé au poste de développement (les codes iraient dans les journaux)",
      });
    }
    if (transport === "mailpit" && env.APP_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_TRANSPORT"],
        message: "« mailpit » est une boîte de test : interdit en production",
      });
    }
    if (transport === "brevo") {
      if (!env.BREVO_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["BREVO_API_KEY"],
          message: "obligatoire avec EMAIL_TRANSPORT=brevo",
        });
      }
      if (!env.EMAIL_FROM) {
        ctx.addIssue({
          code: "custom",
          path: ["EMAIL_FROM"],
          message: "obligatoire avec EMAIL_TRANSPORT=brevo (adresse vérifiée dans Brevo)",
        });
      }
    }
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
    if (env.PUBLIC_SITE_URL && !env.PUBLIC_SITE_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["PUBLIC_SITE_URL"],
        message: "HTTPS obligatoire en production",
      });
    }
    if (env.LOG_LEVEL === "debug" || env.LOG_LEVEL === "trace") {
      ctx.addIssue({
        code: "custom",
        path: ["LOG_LEVEL"],
        message:
          "« debug » et « trace » sont interdits en production (risque de données personnelles dans les journaux)",
      });
    }
  });

type ParsedEnv = z.output<typeof envSchema>;

export type EmailTransport = NonNullable<ParsedEnv["EMAIL_TRANSPORT"]>;

export type AppConfig = Readonly<
  Omit<ParsedEnv, "API_DOCS" | "SMS_ENABLED" | "EMAIL_TRANSPORT" | "EMAIL_FROM"> & {
    API_DOCS: boolean;
    SMS_ENABLED: boolean;
    EMAIL_TRANSPORT: EmailTransport;
    EMAIL_FROM: string;
  }
>;

/** Adresse d'expédition par défaut hors Brevo (domaine réservé « .local » : jamais livrée sur Internet). */
export const DEFAULT_EMAIL_FROM = "no-reply@kemdia.local";

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
  const { API_DOCS, SMS_ENABLED, EMAIL_TRANSPORT, EMAIL_FROM, ...rest } = result.data;
  const onDevMachine = rest.APP_ENV === "local" && rest.NODE_ENV !== "production";
  return Object.freeze({
    ...rest,
    SMS_ENABLED: SMS_ENABLED === "true",
    EMAIL_TRANSPORT: EMAIL_TRANSPORT ?? (onDevMachine ? "console" : "none"),
    EMAIL_FROM: EMAIL_FROM ?? DEFAULT_EMAIL_FROM,
    API_DOCS: API_DOCS === undefined ? rest.NODE_ENV !== "production" : API_DOCS === "true",
  });
}
