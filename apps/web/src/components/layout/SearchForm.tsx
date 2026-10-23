"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ProductImage } from "@/components/ui/ProductImage";
import { cn } from "@/lib/cn";
import { formatFCFA } from "@/lib/format";
import { MAX_QUERY_LENGTH } from "@/lib/search-params";
import {
  SUGGESTION_DELAY_MS,
  parseSuggestions,
  suggestionOptions,
  wantsSuggestions,
  type SuggestionOption,
} from "@/lib/search-suggestions";

const KIND_LABEL = { rayon: "Rayon", marque: "Marque", produit: "Produit" } as const;

/**
 * Champ de recherche. Formulaire GET natif : fonctionne même si le JavaScript n'est pas encore chargé (réseau lent).
 * S7.5-T06 : une fois le JavaScript chargé, suggestions pendant la frappe (rayons, marques, produits), en « combobox »
 * accessible (flèches, Entrée, Échap ; lecteur d'écran informé du nombre de suggestions).
 */
export function SearchForm({
  defaultValue = "",
  className,
  id = "site-search",
}: {
  defaultValue?: string;
  className?: string;
  id?: string;
}) {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [options, setOptions] = useState<SuggestionOption[]>([]);
  const [corrected, setCorrected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // Texte trop court : rien à demander (les anciennes suggestions sont masquées au rendu, voir `shown`)
    if (!wantsSuggestions(value, MAX_QUERY_LENGTH)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/recherche/suggestions?${new URLSearchParams({ q: value.trim() }).toString()}`, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: unknown) => {
          const data = parseSuggestions(body);
          // Panne, limite atteinte, réponse inattendue : pas de suggestions, la recherche reste utilisable
          setOptions(data ? suggestionOptions(data) : []);
          setCorrected(data?.correctedQuery ?? null);
          setActive(-1);
        })
        .catch(() => undefined);
    }, SUGGESTION_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  // Clic en dehors : on ferme
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const wanted = wantsSuggestions(value, MAX_QUERY_LENGTH);
  const shown = wanted ? options : [];
  const visible = open && shown.length > 0;
  const optionId = (i: number) => `${listId}-option-${i}`;

  return (
    <form
      ref={root}
      action="/recherche"
      method="get"
      role="search"
      className={cn("relative w-full", className)}
      onSubmit={() => setOpen(false)}
    >
      <label htmlFor={id} className="sr-only">
        Rechercher un produit
      </label>
      <input
        id={id}
        name="q"
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          } else if (e.key === "ArrowDown" && shown.length) {
            e.preventDefault();
            setOpen(true);
            setActive((i) => (i + 1) % shown.length);
          } else if (e.key === "ArrowUp" && shown.length) {
            e.preventDefault();
            setOpen(true);
            setActive((i) => (i <= 0 ? shown.length - 1 : i - 1));
          } else if (e.key === "Enter" && visible && active >= 0 && shown[active]) {
            e.preventDefault();
            setOpen(false);
            router.push(shown[active].href);
          }
        }}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={listId}
        aria-activedescendant={visible && active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
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
      {/* Annonce discrète pour les lecteurs d'écran */}
      <p className="sr-only" aria-live="polite">
        {visible ? `${shown.length} suggestion${shown.length > 1 ? "s" : ""}` : ""}
      </p>
      <div
        className={cn(
          "border-ink-100 absolute inset-x-0 top-12 z-50 overflow-hidden rounded-2xl border bg-white shadow-lg",
          !visible && "hidden",
        )}
      >
        {corrected && wanted && (
          // Texte affiché via React : échappé automatiquement
          <p className="text-ink-500 border-ink-100 border-b px-4 py-2 text-xs">
            Suggestions pour « {corrected} »
          </p>
        )}
        <ul id={listId} role="listbox" aria-label="Suggestions de recherche" className="py-1">
          {shown.map((o, i) => (
            <li
              key={o.key}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={cn(i === active && "bg-ink-50")}
            >
              <Link
                href={o.href}
                tabIndex={-1}
                onClick={() => setOpen(false)}
                className="hover:bg-ink-50 flex items-center gap-3 px-4 py-2 text-sm"
              >
                {o.kind === "produit" ? (
                  <span className="bg-ink-50 relative size-9 shrink-0 overflow-hidden rounded-lg">
                    {o.image && (
                      <ProductImage
                        src={o.image}
                        alt=""
                        fill
                        sizes="36px"
                        className="object-contain"
                      />
                    )}
                  </span>
                ) : (
                  <span className="text-ink-400 w-9 shrink-0 text-[11px] font-semibold uppercase">
                    {KIND_LABEL[o.kind]}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.price !== undefined && (
                  <span className="text-ink-700 shrink-0 font-semibold">{formatFCFA(o.price)}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </form>
  );
}
