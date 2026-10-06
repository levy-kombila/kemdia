import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  // Chaque test part d'un navigateur vide (panier, favoris, ville)
  if (typeof localStorage !== "undefined") localStorage.clear();
});
