import { Search } from "lucide-react";
import { MAX_QUERY_LENGTH } from "@/lib/search-params";
import { cn } from "@/lib/cn";

/** Formulaire GET natif : fonctionne même si le JavaScript n'est pas encore chargé (réseau lent). */
export function SearchForm({
  defaultValue = "",
  className,
  id = "site-search",
}: {
  defaultValue?: string;
  className?: string;
  id?: string;
}) {
  return (
    <form
      action="/recherche"
      method="get"
      role="search"
      className={cn("relative w-full", className)}
    >
      <label htmlFor={id} className="sr-only">
        Rechercher un produit
      </label>
      <input
        id={id}
        name="q"
        type="search"
        defaultValue={defaultValue}
        maxLength={MAX_QUERY_LENGTH}
        placeholder="Rechercher un produit, une marque, une catégorie…"
        className="border-ink-200 bg-ink-50 placeholder:text-ink-400 focus:border-brand-500 focus:ring-brand-100 h-11 w-full rounded-full border pl-5 pr-14 text-sm focus:bg-white focus:outline-none focus:ring-4"
      />
      <button
        type="submit"
        aria-label="Lancer la recherche"
        className="bg-brand-600 hover:bg-brand-700 absolute right-1 top-1 grid size-9 place-items-center rounded-full text-white transition"
      >
        <Search className="size-4.5" aria-hidden />
      </button>
    </form>
  );
}
