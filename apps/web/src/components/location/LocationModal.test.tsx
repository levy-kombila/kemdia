import { act, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/providers/Providers";
import { useDeliveryLocation } from "@/components/providers/LocationProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/",
}));

beforeAll(() => {
  // jsdom ne connaît pas <dialog>.showModal()
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

function OpenButton() {
  const { openModal } = useDeliveryLocation();
  return (
    <button type="button" onClick={openModal}>
      Choisir la ville
    </button>
  );
}

describe("fenêtre « ville de livraison » (S7-T03)", () => {
  it("absente au chargement (ni rendue ni hydratée), montée à la première ouverture", () => {
    render(
      <Providers>
        <OpenButton />
      </Providers>,
    );
    expect(screen.queryByText(/Où souhaitez-vous être livré/)).toBeNull();
    act(() => screen.getByRole("button", { name: "Choisir la ville" }).click());
    expect(screen.getByText(/Où souhaitez-vous être livré/)).toBeTruthy();
  });
});
