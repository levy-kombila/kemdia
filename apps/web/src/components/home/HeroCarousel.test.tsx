import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HeroCarousel } from "./HeroCarousel";

const labels = ["Offre A", "Offre B", "Offre C"];
const slides = labels.map((l) => (
  <a key={l} href="#">
    Lien {l}
  </a>
));

describe("<HeroCarousel />", () => {
  it("n'expose que la bannière visible au clavier et aux lecteurs d'écran", () => {
    render(<HeroCarousel slides={slides} labels={labels} />);
    const groups = screen.getAllByRole("group", { hidden: true });
    expect(groups[0]).not.toHaveAttribute("inert");
    expect(groups[1]).toHaveAttribute("inert");
  });

  it("change de bannière avec les points et les flèches", async () => {
    const user = userEvent.setup();
    render(<HeroCarousel slides={slides} labels={labels} />);
    await user.click(screen.getByRole("button", { name: /bannière 3 : Offre C/ }));
    expect(screen.getByRole("button", { name: /bannière 3/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Bannière suivante" }));
    expect(screen.getByRole("button", { name: /bannière 1/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
