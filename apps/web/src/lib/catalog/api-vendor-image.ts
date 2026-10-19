import "server-only";
import { CLIENT_IP_HEADER, INTERNAL_KEY_HEADER, PRODUCT_IMAGE_LIMITS } from "@kemdia/contracts";
import { readAtMost } from "@/lib/orders/api-orders";
import { log } from "@/lib/log";

export interface VendorImageApiOptions {
  url: string;
  key: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  /**
   * Adresse du visiteur (S4-T07) : transmise avec la clé interne, pour que la limite de l'API s'applique à CHAQUE
   * visiteur, et non au site tout entier (relecture S6-T04).
   */
  visitorIp?: string | null;
}

export type VendorImageResult =
  | { status: 200; bytes: Uint8Array<ArrayBuffer>; etag: string | null }
  | { status: 304; etag: string | null }
  | { status: 404 }
  | { status: 503 };

const ETAG = /^"[0-9a-f]{32}-(?:large|small)"$/;

const isWebp = (bytes: Uint8Array) =>
  bytes.length >= 12 &&
  String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
  String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";

/**
 * Photo publique d'un produit de vendeur, lue dans l'API (`GET /api/v1/product-images/{id}/{taille}`, S6-T04).
 * L'API ne la donne que si son produit est visible ; le site revérifie en plus ce qu'il relaie : type `image/webp`,
 * en-tête WebP, 2 Mo au plus. Toute autre réponse devient « indisponible » (jamais relayée telle quelle).
 */
export async function fetchVendorImage(
  options: VendorImageApiOptions,
  imageId: string,
  size: "large" | "small",
  ifNoneMatch: string | null,
): Promise<VendorImageResult> {
  const doFetch = options.fetch ?? fetch;
  const headers: Record<string, string> = {
    accept: "image/webp",
    [INTERNAL_KEY_HEADER]: options.key,
  };
  if (ifNoneMatch && ETAG.test(ifNoneMatch)) headers["if-none-match"] = ifNoneMatch;
  if (options.visitorIp) headers[CLIENT_IP_HEADER] = options.visitorIp;
  let response: Response;
  try {
    response = await doFetch(`${options.url}/api/v1/product-images/${imageId}/${size}`, {
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === "TimeoutError";
    log.error("photos", `${timeout ? "délai dépassé" : "API injoignable"}`);
    return { status: 503 };
  }
  const etag = response.headers.get("etag");
  const safeEtag = etag && ETAG.test(etag) ? etag : null;
  if (response.status === 304) return { status: 304, etag: safeEtag };
  if (response.status === 404) {
    await response.body?.cancel().catch(() => undefined);
    return { status: 404 };
  }
  const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (response.status !== 200 || type !== "image/webp") {
    await response.body?.cancel().catch(() => undefined);
    log.error("photos", `réponse inattendue de l'API : statut ${response.status}`);
    return { status: 503 };
  }
  const bytes = await readAtMost(response, PRODUCT_IMAGE_LIMITS.maxStoredBytes).catch(() => null);
  if (!bytes || !isWebp(bytes)) {
    log.error("photos", "fichier non conforme");
    return { status: 503 };
  }
  return { status: 200, bytes, etag: safeEtag };
}
