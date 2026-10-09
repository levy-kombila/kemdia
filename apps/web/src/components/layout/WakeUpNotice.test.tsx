import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WAKE_NOTICE_DELAY_MS, WakeUpNotice } from "./WakeUpNotice";

describe("attente d'une page (S4-T08)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("rien pendant 2 s : pas de clignotement quand l'API répond vite", () => {
    render(<WakeUpNotice demo />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("démo : « La boutique se réveille » après 2 s, annoncé aux lecteurs d'écran", () => {
    render(<WakeUpNotice demo />);
    act(() => vi.advanceTimersByTime(WAKE_NOTICE_DELAY_MS));
    expect(screen.getByRole("status")).toHaveTextContent("La boutique se réveille");
    expect(screen.getByRole("status")).toHaveTextContent("jusqu'à une minute");
  });

  it("ailleurs : un simple « Chargement… »", () => {
    render(<WakeUpNotice demo={false} />);
    act(() => vi.advanceTimersByTime(WAKE_NOTICE_DELAY_MS));
    expect(screen.getByRole("status")).toHaveTextContent("Chargement…");
    expect(screen.queryByText(/se réveille/)).toBeNull();
  });
});
