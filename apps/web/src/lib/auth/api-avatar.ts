import "server-only";
import {
  CLIENT_IP_HEADER,
  INTERNAL_KEY_HEADER,
  ProblemDetailsSchema,
  SESSION_TOKEN_PATTERN,
} from "@kemdia/contracts";
import { log } from "@/lib/log";

/**
 * Photo de profil (S7.5-T08, ADR-0055) côté serveur du site : relais vers `/api/v1/auth/avatar` avec la clé interne,
 * la session du visiteur et son adresse. Jamais de cache partagé : la photo n'appartient qu'à son titulaire.
 */
export interface AvatarApiOptions {
  url: string;
  key: string;
  timeoutMs: number;
  visitorIp: string | null;
  fetch?: typeof fetch;
}

export type AvatarFailure =
  "SESSION_INVALIDE" | "PHOTO_INVALIDE" | "PHOTO_ABSENTE" | "TROP_DE_REQUETES" | "INDISPONIBLE";
export type AvatarResult<T> =
  { ok: true; data: T } | { ok: false; code: AvatarFailure; message?: string };

const KNOWN: readonly AvatarFailure[] = [
  "SESSION_INVALIDE",
  "PHOTO_INVALIDE",
  "PHOTO_ABSENTE",
  "TROP_DE_REQUETES",
];
const MAX_IMAGE_BYTES = 256 * 1024;

export function createAvatarApi(options: AvatarApiOptions) {
  const doFetch = options.fetch ?? fetch;

  function headersFor(token: string, extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      [INTERNAL_KEY_HEADER]: options.key,
      authorization: `Bearer ${token}`,
      ...extra,
    };
    if (options.visitorIp) headers[CLIENT_IP_HEADER] = options.visitorIp;
    return headers;
  }

  async function send(
    method: "GET" | "POST" | "DELETE",
    token: string,
    init: { headers?: Record<string, string>; body?: BodyInit } = {},
  ): Promise<Response | null> {
    try {
      return await doFetch(`${options.url}/api/v1/auth/avatar`, {
        method,
        headers: headersFor(token, init.headers),
        ...(init.body ? { body: init.body } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch {
      log.error("identité", `/avatar ${method} : API injoignable ou délai dépassé`);
      return null;
    }
  }

  async function failure(response: Response | null, method: string): Promise<AvatarResult<never>> {
    if (!response) return { ok: false, code: "INDISPONIBLE" };
    const problem = ProblemDetailsSchema.safeParse(await response.json().catch(() => undefined));
    const code = KNOWN.find((c) => problem.success && c === problem.data.code);
    if (code)
      return { ok: false, code, ...(problem.success ? { message: problem.data.detail } : {}) };
    log.error("identité", `/avatar ${method} : statut ${response.status}`);
    return { ok: false, code: "INDISPONIBLE" };
  }

  return {
    /** La photo (WebP) ; `notModified` si l'empreinte donnée est toujours la bonne. */
    async read(
      token: string,
      ifNoneMatch: string | null,
    ): Promise<
      AvatarResult<
        | { notModified: true; etag: string }
        | { notModified: false; etag: string; bytes: Uint8Array }
      >
    > {
      if (!SESSION_TOKEN_PATTERN.test(token)) return { ok: false, code: "SESSION_INVALIDE" };
      const etagIn = ifNoneMatch && /^"[0-9a-f]{32}"$/.test(ifNoneMatch) ? ifNoneMatch : null;
      const response = await send(
        "GET",
        token,
        etagIn ? { headers: { "if-none-match": etagIn } } : {},
      );
      if (response?.status === 304)
        return { ok: true, data: { notModified: true, etag: etagIn ?? "" } };
      if (!response?.ok) return failure(response, "GET");
      const etag = response.headers.get("etag") ?? "";
      const type = response.headers.get("content-type");
      const bytes = new Uint8Array(await response.arrayBuffer());
      // Rien d'autre qu'un petit WebP n'est relayé
      const webp =
        bytes.length >= 12 &&
        String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
      if (
        type !== "image/webp" ||
        !webp ||
        bytes.length > MAX_IMAGE_BYTES ||
        !/^"[0-9a-f]{32}"$/.test(etag)
      ) {
        log.error("identité", "/avatar GET : réponse inattendue");
        return { ok: false, code: "INDISPONIBLE" };
      }
      return { ok: true, data: { notModified: false, etag, bytes } };
    },

    async upload(
      token: string,
      bytes: Uint8Array<ArrayBuffer>,
      type: string,
    ): Promise<AvatarResult<{ avatar: string }>> {
      if (!SESSION_TOKEN_PATTERN.test(token)) return { ok: false, code: "SESSION_INVALIDE" };
      const response = await send("POST", token, {
        headers: { "content-type": type },
        body: bytes,
      });
      if (!response?.ok) return failure(response, "POST");
      const body = (await response.json().catch(() => null)) as { avatar?: unknown } | null;
      return typeof body?.avatar === "string" && /^[0-9a-f]{16}$/.test(body.avatar)
        ? { ok: true, data: { avatar: body.avatar } }
        : { ok: false, code: "INDISPONIBLE" };
    },

    async remove(token: string): Promise<AvatarResult<undefined>> {
      if (!SESSION_TOKEN_PATTERN.test(token)) return { ok: false, code: "SESSION_INVALIDE" };
      const response = await send("DELETE", token);
      if (response?.status === 204) return { ok: true, data: undefined };
      return failure(response, "DELETE");
    },
  };
}
