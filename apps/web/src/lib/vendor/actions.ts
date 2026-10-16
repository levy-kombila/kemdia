"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, expiredCookieOptions } from "@/lib/auth/cookies";
import { forgetSession } from "@/lib/auth/session";
import type { VendorFailure } from "./api-vendor";
import {
  checkContent,
  checkShopRequest,
  checkVariants,
  parseAmount,
  STOCK_MAX,
  type ProductErrors,
} from "./forms";
import { isUuid, photoIdOf } from "./images";
import { vendorErrorMessage, type VendorNotice } from "./messages";
import { sessionToken, vendorApi } from "./vendor";

/**
 * Actions serveur de l'espace vendeur (S6-T06, ADR-0037). Points d'entrée PUBLICS : chaque argument est revérifié ici
 * (type, longueur, forme), puis l'API refait toutes les règles (rôle vendeur, boutique active, produit de SA boutique,
 * modération). Le jeton de session ne quitte jamais le serveur.
 */

export type VendorFormFailure = {
  ok: false;
  message: string;
  errors?: ProductErrors | Record<string, string>;
  signedOut?: boolean;
};

async function failure(token: string, result: VendorFailure): Promise<VendorFormFailure> {
  if (result.code === "SESSION_INVALIDE") {
    forgetSession(token);
    (await cookies()).set(SESSION_COOKIE, "", expiredCookieOptions());
    return { ok: false, message: vendorErrorMessage(result.code), signedOut: true };
  }
  return { ok: false, message: vendorErrorMessage(result.code, result.detail) };
}

const signedOut: VendorFormFailure = {
  ok: false,
  message: vendorErrorMessage("SESSION_INVALIDE"),
  signedOut: true,
};
const invalid = (errors: VendorFormFailure["errors"]): VendorFormFailure => ({
  ok: false,
  message: "Vérifiez les champs signalés.",
  errors,
});

// --- Demande de boutique (formulaire avec JavaScript : erreurs par champ) ---

export async function applyShopAction(input: unknown): Promise<{ ok: true } | VendorFormFailure> {
  const token = await sessionToken();
  if (!token) return signedOut;
  const checked = checkShopRequest(input);
  if (!checked.ok) return invalid(checked.errors);
  const result = await vendorApi().applyShop(token, checked.value);
  if (!result.ok) {
    if (result.code === "NOM_BOUTIQUE_PRIS")
      return invalid({ name: vendorErrorMessage(result.code) });
    return failure(token, result);
  }
  return { ok: true };
}

// --- Produit : création et fiche (formulaire avec JavaScript : variantes, erreurs par champ) ---

export async function createProductAction(
  input: unknown,
): Promise<{ ok: true; id: string } | VendorFormFailure> {
  const token = await sessionToken();
  if (!token) return signedOut;
  const raw = (input ?? {}) as Record<string, unknown>;
  const content = checkContent(raw);
  const variants = checkVariants(raw.variants);
  if (!content.ok || !variants.ok)
    return invalid({
      ...(content.ok ? {} : content.errors),
      ...(variants.ok ? {} : variants.errors),
    });
  const result = await vendorApi().createProduct(token, {
    ...content.value,
    variants: variants.value,
  });
  if (!result.ok) return failure(token, result);
  return { ok: true, id: result.data.id };
}

export async function updateContentAction(
  productId: unknown,
  input: unknown,
): Promise<{ ok: true } | VendorFormFailure> {
  const token = await sessionToken();
  if (!token) return signedOut;
  if (!isUuid(productId)) return { ok: false, message: vendorErrorMessage("PRODUIT_INTROUVABLE") };
  const content = checkContent(input);
  if (!content.ok) return invalid(content.errors);
  const result = await vendorApi().updateContent(token, productId, content.value);
  if (!result.ok) return failure(token, result);
  return { ok: true };
}

// --- Actions par formulaire HTML simple (marchent sans JavaScript) : retour à la fiche avec un code ---

const field = (form: FormData, name: string, max = 40) => {
  const value = form.get(name);
  return typeof value === "string" && value.length <= max ? value : null;
};

async function productPage(form: FormData): Promise<{ token: string; id: string; page: string }> {
  const id = field(form, "productId");
  if (!id || !isUuid(id)) redirect("/vendeur/produits");
  const page = `/vendeur/produits/${id.toLowerCase()}`;
  const token = await sessionToken();
  if (!token) redirect(`/connexion?retour=${encodeURIComponent(page)}`);
  return { token, id: id.toLowerCase(), page };
}

async function after(
  token: string,
  page: string,
  result: { ok: true } | VendorFailure,
  notice: VendorNotice,
): Promise<never> {
  if (!result.ok) {
    if (result.code === "SESSION_INVALIDE") {
      forgetSession(token);
      (await cookies()).set(SESSION_COOKIE, "", expiredCookieOptions());
      redirect(`/connexion?retour=${encodeURIComponent(page)}`);
    }
    // Boutique suspendue entre-temps : l'accueil de l'espace explique pourquoi
    if (result.code === "ACCES_REFUSE" || result.code === "BOUTIQUE_INACTIVE") redirect("/vendeur");
    redirect(`${page}?erreur=${result.code}`);
  }
  redirect(`${page}?ok=${notice}`);
}

/** Prix, prix barré, stock (avec le stock lu avant : jamais écrasé) et mise en vente d'une variante. */
export async function updateVariantAction(form: FormData): Promise<never> {
  const { token, id, page } = await productPage(form);
  const variantId = field(form, "variantId");
  const price = parseAmount(field(form, "price", 20));
  const compareAtPrice = parseAmount(field(form, "compareAtPrice", 20));
  const stock = parseAmount(field(form, "stock", 20), STOCK_MAX);
  const previousStock = parseAmount(field(form, "previousStock", 20), STOCK_MAX);
  if (
    !variantId ||
    !isUuid(variantId) ||
    price === null ||
    Number.isNaN(price) ||
    price <= 0 ||
    Number.isNaN(compareAtPrice) ||
    (compareAtPrice !== null && compareAtPrice <= price) ||
    stock === null ||
    Number.isNaN(stock) ||
    previousStock === null ||
    Number.isNaN(previousStock)
  )
    redirect(`${page}?erreur=PRODUIT_INVALIDE`);
  const result = await vendorApi().updateVariant(token, id, variantId, {
    price,
    compareAtPrice,
    isActive: form.get("isActive") === "on",
    // Stock envoyé seulement s'il a changé, avec la valeur lue : l'API refuse si une commande l'a modifié entre-temps
    ...(stock !== previousStock ? { stock, previousStock } : {}),
  });
  return after(token, page, result, "variante-modifiee");
}

export async function archiveProductAction(form: FormData): Promise<never> {
  const { token, id, page } = await productPage(form);
  return after(token, page, await vendorApi().archive(token, id), "produit-archive");
}

export async function restoreProductAction(form: FormData): Promise<never> {
  const { token, id, page } = await productPage(form);
  return after(token, page, await vendorApi().restore(token, id), "produit-remis");
}

/** Photo principale : l'ordre est relu dans l'API (jamais reçu du navigateur), la photo choisie passe en premier. */
export async function mainPhotoAction(form: FormData): Promise<never> {
  const { token, id, page } = await productPage(form);
  const imageId = field(form, "imageId");
  if (!imageId || !isUuid(imageId)) redirect(`${page}?erreur=PHOTO_INTROUVABLE`);
  const current = await vendorApi().product(token, id);
  if (!current.ok) return after(token, page, current, "photo-principale");
  const ids = current.data.images.map(photoIdOf).filter((x): x is string => x !== null);
  const wanted = imageId.toLowerCase();
  if (!ids.includes(wanted)) redirect(`${page}?erreur=PHOTO_INTROUVABLE`);
  const result = await vendorApi().reorderImages(token, id, [
    wanted,
    ...ids.filter((x) => x !== wanted),
  ]);
  return after(token, page, result, "photo-principale");
}

export async function removePhotoAction(form: FormData): Promise<never> {
  const { token, id, page } = await productPage(form);
  const imageId = field(form, "imageId");
  if (!imageId || !isUuid(imageId)) redirect(`${page}?erreur=PHOTO_INTROUVABLE`);
  return after(token, page, await vendorApi().removeImage(token, id, imageId), "photo-retiree");
}
