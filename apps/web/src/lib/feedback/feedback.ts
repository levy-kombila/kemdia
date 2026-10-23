import "server-only";
import { headers } from "next/headers";
import { catalogSource } from "@/lib/config/server-config";
import { UNKNOWN_VISITOR, clientIpHeaderName, visitorIp } from "@/lib/security/client-ip";
import { createFeedbackApi } from "./api-feedback";

let instance: ReturnType<typeof createFeedbackApi> | undefined;

/** Même API et même clé que le catalogue ; adresse du visiteur transmise (limites par visiteur). */
export function feedbackApi() {
  instance ??= createFeedbackApi({
    ...catalogSource(),
    visitorIp: async () => {
      const name = clientIpHeaderName();
      if (!name) return null;
      return visitorIp(await headers(), name) ?? UNKNOWN_VISITOR;
    },
  });
  return instance;
}
