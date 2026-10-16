import { fetchVendorImage } from "@/lib/catalog/api-vendor-image";
import { parseVendorImageFile } from "@/lib/catalog/vendor-image";
import { catalogSource } from "@/lib/config/server-config";
import { UNKNOWN_VISITOR, clientIpHeaderName, visitorIp } from "@/lib/security/client-ip";

/**
 * Photos des produits des vendeurs (S6-T04, ADR-0035), à la même adresse que le site (« /images/v/<id>.webp », vignette
 * « …-480.webp ») : le serveur du site les demande à l'API avec sa clé interne. L'API ne sert que les photos des
 * produits visibles ; même durée de cache que le catalogue (60 s + 5 min pendant la mise à jour), donc une photo retirée
 * disparaît en quelques minutes. Rien d'autre qu'un WebP vérifié n'est relayé.
 */
const COMMON = { "x-content-type-options": "nosniff" } as const;
const PUBLIC_CACHE = "public, max-age=60, stale-while-revalidate=300";
/** Absence : 60 s, sans copie ancienne (une photo validée entre-temps apparaît vite). */
const MISSING_CACHE = "public, max-age=60";

function text(status: number, message: string, cache: string): Response {
  return new Response(message, {
    status,
    headers: { ...COMMON, "cache-control": cache, "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;
  const wanted = parseVendorImageFile(file);
  if (!wanted) return text(404, "Photo introuvable.", MISSING_CACHE);
  const ipHeader = clientIpHeaderName();
  const ip = ipHeader ? (visitorIp(request.headers, ipHeader) ?? UNKNOWN_VISITOR) : null;
  const result = await fetchVendorImage(
    { ...catalogSource(), visitorIp: ip },
    wanted.imageId,
    wanted.size,
    request.headers.get("if-none-match"),
  );
  switch (result.status) {
    case 404:
      return text(404, "Photo introuvable.", MISSING_CACHE);
    case 503:
      return text(503, "Photo momentanément indisponible.", "no-store");
    case 304:
      return new Response(null, {
        status: 304,
        headers: {
          ...COMMON,
          "cache-control": PUBLIC_CACHE,
          ...(result.etag ? { etag: result.etag } : {}),
        },
      });
    case 200:
      return new Response(result.bytes, {
        status: 200,
        headers: {
          ...COMMON,
          "cache-control": PUBLIC_CACHE,
          "content-type": "image/webp",
          "content-length": String(result.bytes.byteLength),
          ...(result.etag ? { etag: result.etag } : {}),
        },
      });
  }
}
