import "server-only";
import { headers } from "next/headers";
import { catalogSource } from "@/lib/config/server-config";
import { UNKNOWN_VISITOR, clientIpHeaderName, visitorIp } from "@/lib/security/client-ip";
import { createPrivacyApi, type PrivacyApi } from "./api-privacy";

let instance: PrivacyApi | undefined;

/** Même API et même clé que le catalogue (ADR-0011). */
export function privacyApi(): PrivacyApi {
  instance ??= createPrivacyApi({
    ...catalogSource(),
    visitorIp: async () => {
      const name = clientIpHeaderName();
      if (!name) return null;
      return visitorIp(await headers(), name) ?? UNKNOWN_VISITOR;
    },
  });
  return instance;
}
