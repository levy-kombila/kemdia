/**
 * « Port » de commande (même principe que lib/auth/client.ts).
 * S2 : adaptateur de DÉMONSTRATION, rien n'est envoyé ni enregistré, aucun paiement réel.
 * S5 : adaptateur vers l'API (module orders + payments, webhooks Mobile Money signés).
 */
import type { OrderRequest } from "@/lib/checkout";

export type PlaceOrderResult =
  | { ok: true; orderNumber: string; status: "awaiting-payment" | "confirmed" }
  | { ok: false; error: "out-of-stock" | "payment-refused" | "unavailable" };

export interface OrderClient {
  placeOrder(request: OrderRequest): Promise<PlaceOrderResult>;
  /** Mobile Money : attendre que le client valide la demande sur son téléphone (code PIN). */
  waitForPayment(orderNumber: string): Promise<{ ok: boolean }>;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function demoOrderNumber(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `KMD-DEMO-${hex}`;
}

export function createDemoOrderClient(latencyMs = 900): OrderClient {
  return {
    async placeOrder(request) {
      await wait(latencyMs);
      if (request.items.length === 0) return { ok: false, error: "unavailable" };
      return {
        ok: true,
        orderNumber: demoOrderNumber(),
        status: request.payment.method === "cod" ? "confirmed" : "awaiting-payment",
      };
    },
    async waitForPayment() {
      await wait(latencyMs * 3);
      return { ok: true };
    },
  };
}

export const orderClient: OrderClient = createDemoOrderClient();
