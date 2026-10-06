import { z } from "zod";
import { HealthSchema } from "../health/health.schema.js";
import { ProblemDetailsSchema } from "../http/problem-details.schema.js";
import { catalogPaths } from "../modules/catalog/interface/catalog.openapi.js";
import * as catalogSchemas from "../modules/catalog/interface/schemas.js";

/** Version du contrat HTTP (indépendante de la version de l'image) : à augmenter à chaque changement de l'API. */
export const API_CONTRACT_VERSION = "1.0.0";

// Les schémas doivent être chargés pour être enregistrés (.meta({ id })) avant la génération
void [HealthSchema, ProblemDetailsSchema, catalogSchemas];

type JsonSchema = Record<string, unknown>;

/** Schémas Zod enregistrés → composants OpenAPI 3.1 (JSON Schema 2020-12). */
function components(): Record<string, JsonSchema> {
  const { schemas } = z.toJSONSchema(z.globalRegistry, {
    uri: (id) => `#/components/schemas/${id}`,
  }) as { schemas: Record<string, JsonSchema> };
  return Object.fromEntries(
    Object.entries(schemas)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, schema]) => {
        const rest = { ...schema };
        // $schema et $id sont propres à un fichier JSON Schema isolé : inutiles dans un composant OpenAPI
        delete rest.$schema;
        delete rest.$id;
        return [id, rest];
      }),
  );
}

/** Document OpenAPI complet de l'API, généré à partir des schémas réellement utilisés. */
export function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "API Kemdia",
      version: API_CONTRACT_VERSION,
      description: [
        "API de la plateforme e-commerce Kemdia (Gabon). Montants en FCFA entiers (BR-004), identifiants UUID (BR-042).",
        "",
        "- Erreurs : format Problem Details (RFC 9457), message en français, identifiant de requête.",
        "- Limitation de débit : par adresse IP et par minute ; en cas de dépassement, 429 et en-tête `Retry-After`.",
        "- Cache : les lectures du catalogue peuvent être gardées 60 s (`Cache-Control`).",
      ].join("\n"),
    },
    servers: [{ url: "/", description: "Même adresse que cette documentation" }],
    tags: [
      {
        name: "Catalogue",
        description: "Catégories, produits, variantes, disponibilité (module catalog)",
      },
      { name: "Supervision", description: "État du service" },
    ],
    paths: {
      "/api/health": {
        get: {
          tags: ["Supervision"],
          summary: "État de l'API et de la base de données",
          operationId: "health",
          responses: {
            "200": {
              description: "Tout fonctionne",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } },
            },
            "503": {
              description: "Base de données indisponible",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } },
            },
          },
        },
      },
      ...catalogPaths,
    },
    components: { schemas: components() },
  };
}
