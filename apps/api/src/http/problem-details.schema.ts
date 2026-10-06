import { z } from "zod";

/** Format de toutes les réponses d'erreur (RFC 9457) — voir problem-details.filter.ts. */
export const ProblemDetailsSchema = z
  .object({
    type: z.literal("about:blank"),
    title: z
      .string()
      .describe("Résumé en français (« Ressource introuvable », « Trop de requêtes »…)"),
    status: z.int().min(400).max(599),
    detail: z
      .string()
      .optional()
      .describe("Explication destinée au client (erreurs prévues uniquement)"),
    requestId: z
      .string()
      .optional()
      .describe("Identifiant à communiquer au support (en-tête X-Request-Id)"),
  })
  .meta({ id: "ProblemDetails", description: "Erreur au format Problem Details (RFC 9457)" });
