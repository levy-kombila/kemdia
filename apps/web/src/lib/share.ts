import { formatFCFA } from "./format";

/**
 * Lien de partage WhatsApp (wa.me ouvre l'application sur téléphone, WhatsApp Web sur ordinateur).
 * Le texte est encodé : un titre contenant « & » ou « # » ne peut pas casser le lien.
 * utm_source permettra de mesurer les ventes venues de WhatsApp (S8, analytique).
 */
export function whatsappShareUrl(url: string, title: string, price: number): string {
  const tracked = new URL(url);
  tracked.searchParams.set("utm_source", "whatsapp");
  tracked.searchParams.set("utm_medium", "partage");
  const text = `${title} à ${formatFCFA(price)} sur Kemdia 👉 ${tracked.toString()}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
