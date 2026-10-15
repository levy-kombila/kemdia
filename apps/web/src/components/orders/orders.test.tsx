import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Payment } from "@kemdia/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CancelOrderForm } from "./CancelOrderForm";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { PaymentPanel } from "./PaymentPanel";

const actions = vi.hoisted(() => ({ retryPayment: vi.fn(), cancelOrder: vi.fn() }));
vi.mock("@/lib/orders/order-actions", () => actions);

const REF = "KMD-7F3K9Q";
const payment = (overrides: Partial<Payment> = {}): Payment => ({
  id: "11111111-1111-4111-8111-111111111111",
  orderReference: REF,
  method: "airtel",
  amount: 22_000,
  phone: "+241077123456",
  status: "pending",
  attempt: 1,
  attemptsLeft: 2,
  failureReason: null,
  createdAt: "2026-10-15T13:00:00.000Z",
  completedAt: null,
  ...overrides,
});
const panel = (p: Payment | null, sandbox = false) =>
  render(
    <PaymentPanel
      reference={REF}
      total={22_000}
      method="airtel"
      payment={p}
      dueAt="2026-10-15T13:30:00.000Z"
      sandbox={sandbox}
    />,
  );

beforeEach(() => vi.clearAllMocks());

describe("<PaymentPanel /> (S5-T07)", () => {
  it("demande en attente : montant, numéro, heure limite (heure du Gabon) ; pas de bouton", () => {
    panel(payment(), true);
    expect(
      screen.getByRole("heading", { name: "Validez sur votre téléphone" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/077 12 34 56/)).toBeInTheDocument();
    expect(screen.getByText(/À payer avant 14:30/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouvrir le téléphone simulé" })).toHaveAttribute(
      "href",
      "/demo/telephone",
    );
  });

  it("essai échoué : raison en clair et « Réessayer » avec le nombre d'essais restants", async () => {
    actions.retryPayment.mockResolvedValue({ tone: "success", message: "Demande envoyée." });
    panel(payment({ status: "failed", failureReason: "solde_insuffisant", attemptsLeft: 1 }));
    expect(screen.getByText(/solde insuffisant/)).toBeInTheDocument();
    expect(screen.getByText("Dernier essai possible.")).toBeInTheDocument();
    expect(screen.queryByText(/téléphone simulé/)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /Réessayer le paiement/ }));
    expect(await screen.findByText("Demande envoyée.")).toBeInTheDocument();
    expect((actions.retryPayment.mock.calls[0]![1] as FormData).get("reference")).toBe(REF);
  });

  it("plus d'essai : pas de bouton, explication ; aucune demande partie : bouton d'envoi", () => {
    const { unmount } = panel(payment({ status: "expired", attemptsLeft: 0 }));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/utilisé vos 3 essais/)).toBeInTheDocument();
    unmount();
    panel(null);
    expect(
      screen.getByRole("button", { name: /Envoyer la demande de paiement/ }),
    ).toBeInTheDocument();
  });
});

describe("<CancelOrderForm />", () => {
  it("demande une confirmation avant d'annuler", async () => {
    actions.cancelOrder.mockResolvedValue({ tone: "success", message: "Commande annulée." });
    const user = userEvent.setup();
    render(<CancelOrderForm reference={REF} paymentPending />);
    await user.click(screen.getByRole("button", { name: "Annuler la commande" }));
    expect(actions.cancelOrder).not.toHaveBeenCalled();
    expect(screen.getByText(/ne la validez pas/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Non, la garder" }));
    await user.click(screen.getByRole("button", { name: "Annuler la commande" }));
    await user.click(screen.getByRole("button", { name: "Oui, annuler la commande" }));
    expect(await screen.findByText("Commande annulée.")).toBeInTheDocument();
    expect(actions.cancelOrder).toHaveBeenCalledTimes(1);
  });
});

describe("<OrderStatusBadge />", () => {
  it("le statut est écrit en toutes lettres", () => {
    render(<OrderStatusBadge status="pending_payment" />);
    expect(screen.getByText("En attente de paiement")).toBeInTheDocument();
  });
});
