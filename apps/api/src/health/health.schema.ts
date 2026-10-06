import { z } from "zod";

export const HealthSchema = z
  .object({
    status: z.enum(["ok", "degrade"]),
    version: z.string(),
    environment: z.enum(["local", "demo", "staging", "production"]),
    checks: z.object({ database: z.enum(["ok", "indisponible"]) }),
  })
  .meta({ id: "Health", description: "État de l'API et de la base de données" });
