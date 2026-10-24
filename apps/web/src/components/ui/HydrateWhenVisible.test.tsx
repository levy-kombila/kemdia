import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Faux IntersectionObserver : le test décide quand la zone « approche de l'écran ». */
let notify: ((visible: boolean) => void) | undefined;
class FakeObserver {
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    notify = (visible) => callback([{ isIntersecting: visible }]);
  }
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.resetModules();
  notify = undefined;
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});
afterEach(() => vi.unstubAllGlobals());

describe("<HydrateWhenVisible /> (S3-T08)", () => {
  it("au premier chargement : attend que la zone approche de l'écran, puis rend le contenu", async () => {
    const { HydrateWhenVisible } = await import("./HydrateWhenVisible");
    render(
      <HydrateWhenVisible>
        <button type="button">Ajouter</button>
      </HydrateWhenVisible>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    act(() => notify?.(false));
    expect(screen.queryByRole("button")).toBeNull();
    act(() => notify?.(true));
    expect(screen.getByRole("button", { name: "Ajouter" })).toBeInTheDocument();
  });

  it("après la première hydratation (navigation côté client) : contenu rendu tout de suite", async () => {
    const { markFirstHydrationDone } = await import("@/lib/hydration");
    const { HydrateWhenVisible } = await import("./HydrateWhenVisible");
    markFirstHydrationDone();
    render(
      <HydrateWhenVisible>
        <p>Produits</p>
      </HydrateWhenVisible>,
    );
    expect(screen.getByText("Produits")).toBeInTheDocument();
  });

  it("sans IntersectionObserver (vieux navigateur) : contenu rendu tout de suite", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { HydrateWhenVisible } = await import("./HydrateWhenVisible");
    render(
      <HydrateWhenVisible>
        <p>Produits</p>
      </HydrateWhenVisible>,
    );
    expect(await screen.findByText("Produits")).toBeInTheDocument();
  });

  it("focus clavier (S8-T04) : le lien atteint avec Tab garde le focus quand la zone devient interactive", async () => {
    const { HydrateWhenVisible } = await import("./HydrateWhenVisible");
    // HTML du serveur, comme au premier chargement d'une page
    const container = document.createElement("div");
    container.innerHTML = '<div><a href="/a">Lien A</a><a href="/b">Lien B</a></div>';
    document.body.appendChild(container);
    render(
      <HydrateWhenVisible>
        <a href="/a">Lien A</a>
        <a href="/b">Lien B</a>
      </HydrateWhenVisible>,
      { container, hydrate: true },
    );
    const serverLink = container.querySelector<HTMLAnchorElement>('a[href="/b"]')!;
    await act(async () => serverLink.focus());
    const focused = document.activeElement as HTMLAnchorElement;
    expect(focused.isConnected).toBe(true);
    expect(focused.getAttribute("href")).toBe("/b");
    container.remove();
  });
});
