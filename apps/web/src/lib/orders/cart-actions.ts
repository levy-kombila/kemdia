"use server";

import { CART_MAX_LINES, CART_MAX_QUANTITY, UUID_PATTERN } from "@kemdia/contracts/constants";
import type { Cart } from "@kemdia/contracts";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { catalogSource } from "@/lib/config/server-config";
import { UNKNOWN_VISITOR, clientIpHeaderName, visitorIp } from "@/lib/security/client-ip";
import { createCartApi, type CartApi, type CartFailureCode } from "./api-cart";

/**
 * Actions serveur du panier (S5-T01, ADR-0023). Ce sont des points d'entrée publics : chaque argument est revérifié
 * ici ; l'API refait toutes les règles (BR-001, BR-004). Le jeton de session reste dans son cookie `HttpOnly`.
 * Ces actions ne posent ni n'effacent aucun cookie : elles ne redessinent pas la page.
 *
 * - Sans cookie de session : `guest` (le panier reste dans le navigateur, comme avant).
 * - Connecté : le panier vit sur le serveur (choix du 2026-10-10) ; le panier du navigateur y est réuni une fois.
 */

let instance: CartApi | undefined;
function cartApi(): CartApi {
  instance ??= createCartApi({
    ...catalogSource(),
    visitorIp: async () => {
      const name = clientIpHeaderName();
      if (!name) return null;
      return visitorIp(await headers(), name) ?? UNKNOWN_VISITOR;
    },
  });
  return instance;
}

export type CartActionResult = { ok: true; cart: Cart } | { ok: false; code: CartFailureCode };

export type CartSyncResult =
  /** Personne n'est connecté (ou la session ne vaut plus rien) : panier du navigateur */
  | { status: "guest" }
  /** Connecté : panier du compte ; `ignored` = lignes du navigateur non reprises lors de la réunion */
  | { status: "signed-in"; cart: Cart; ignored: number }
  /** Connecté, mais l'API ne répond pas : on garde le panier du navigateur, sans rien effacer */
  | { status: "unavailable" };

type Line = { variantId: string; quantity: number };

const isVariantId = (value: unknown): value is string =>
  typeof value === "string" && value.length === 36 && UUID_PATTERN.test(value);
const isQuantity = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= CART_MAX_QUANTITY;

/** Lignes venues du navigateur (donnée non fiable) : variantes et quantités valides seulement, sans doublon. */
function cleanLines(input: unknown): Line[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const lines: Line[] = [];
  for (const item of input.slice(0, CART_MAX_LINES * 2)) {
    if (!item || typeof item !== "object") continue;
    const { variantId: raw, quantity } = item as Record<string, unknown>;
    if (!isVariantId(raw)) continue;
    // Majuscules et minuscules désignent le même UUID : une seule ligne
    const variantId = raw.toLowerCase();
    if (seen.has(variantId)) continue;
    const q =
      typeof quantity === "number" ? Math.min(Math.floor(quantity), CART_MAX_QUANTITY) : NaN;
    if (!isQuantity(q)) continue;
    seen.add(variantId);
    lines.push({ variantId, quantity: q });
    if (lines.length === CART_MAX_LINES) break;
  }
  return lines;
}

async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Au chargement du site : quel panier afficher ? Connecté avec un panier dans le navigateur → réunion (quantités
 * additionnées, côté API) ; le navigateur peut alors vider le sien. Connecté sans panier local → lecture simple.
 * `mergeId` (tiré par le navigateur, gardé avec son panier) rend la réunion idempotente : renvoyée, elle ne double rien.
 */
export async function syncCart(localLines: unknown, mergeId?: unknown): Promise<CartSyncResult> {
  const token = await sessionToken();
  if (!token) return { status: "guest" };
  const lines = cleanLines(localLines);
  const id = isVariantId(mergeId) ? mergeId.toLowerCase() : null;
  const result =
    lines.length && id ? await cartApi().merge(token, id, lines) : await cartApi().get(token);
  if (result.ok) {
    const { ignored = 0, ...cart } = result.data as Cart & { ignored?: number };
    return { status: "signed-in", cart, ignored };
  }
  return result.code === "SESSION_INVALIDE" ? { status: "guest" } : { status: "unavailable" };
}

async function withToken(
  run: (token: string) => ReturnType<CartApi["get"]>,
): Promise<CartActionResult> {
  const token = await sessionToken();
  if (!token) return { ok: false, code: "SESSION_INVALIDE" };
  const result = await run(token);
  return result.ok ? { ok: true, cart: result.data } : { ok: false, code: result.code };
}

export async function addToServerCart(
  variantId: unknown,
  quantity: unknown,
): Promise<CartActionResult> {
  if (!isVariantId(variantId) || !isQuantity(quantity)) return { ok: false, code: "INDISPONIBLE" };
  return withToken((token) => cartApi().add(token, variantId, quantity));
}

export async function setServerCartQuantity(
  variantId: unknown,
  quantity: unknown,
): Promise<CartActionResult> {
  if (!isVariantId(variantId) || !isQuantity(quantity)) return { ok: false, code: "INDISPONIBLE" };
  return withToken((token) => cartApi().setQuantity(token, variantId, quantity));
}

export async function removeFromServerCart(variantId: unknown): Promise<CartActionResult> {
  if (!isVariantId(variantId)) return { ok: false, code: "INDISPONIBLE" };
  return withToken((token) => cartApi().remove(token, variantId));
}

export async function clearServerCart(): Promise<CartActionResult> {
  return withToken((token) => cartApi().clear(token));
}
