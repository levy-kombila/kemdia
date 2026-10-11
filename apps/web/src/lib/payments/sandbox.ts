import "server-only";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { catalogSource } from "@/lib/config/server-config";
import { UNKNOWN_VISITOR, clientIpHeaderName, visitorIp } from "@/lib/security/client-ip";
import { createSandboxApi, type SandboxApi } from "./api-sandbox";

let instance: SandboxApi | undefined;

/** Même API et même clé que le catalogue (ADR-0011). */
export function sandboxApi(): SandboxApi {
  instance ??= createSandboxApi({
    ...catalogSource(),
    visitorIp: async () => {
      const name = clientIpHeaderName();
      if (!name) return null;
      return visitorIp(await headers(), name) ?? UNKNOWN_VISITOR;
    },
  });
  return instance;
}

/**
 * Le téléphone simulé n'existe que là où l'opérateur simulé tourne : poste de développement, tests de bout en bout et
 * démo. En préproduction et en production — ou si `APP_ENV` manque —, la page n'existe pas (404), sans appeler l'API.
 */
export function sandboxPageEnabled(appEnv = process.env.APP_ENV): boolean {
  return appEnv === "local" || appEnv === "e2e" || appEnv === "demo";
}

export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}
