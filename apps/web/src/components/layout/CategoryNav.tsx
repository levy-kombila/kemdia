"use client";

import { ChevronDown, ChevronRight, Headset, LayoutGrid, Menu, Tag, X, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { cn } from "@/lib/cn";

export type NavCategory = { name: string; slug: string; icon: string; children: NavCategory[] };

export function CategoryNav({ tree }: { tree: NavCategory[] }) {
  const [megaOpen, setMegaOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [active, setActive] = useState(0);
  const pathname = usePathname();
  const megaId = useId();
  const navRef = useRef<HTMLDivElement>(null);

  // Ferme les menus quand on change de page
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMegaOpen(false);
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (!megaOpen && !drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMegaOpen(false);
        setDrawerOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (megaOpen && navRef.current && !navRef.current.contains(e.target as Node))
        setMegaOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [megaOpen, drawerOpen]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
  }, [drawerOpen]);

  const current = tree[active];

  return (
    <nav aria-label="Catégories" className="bg-ink-900 relative text-white" ref={navRef}>
      <div className="container-page flex h-12 items-center gap-1">
        {/* Mobile : bouton tiroir */}
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold hover:bg-white/10 lg:hidden"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
        >
          <Menu className="size-5" aria-hidden /> Menu
        </button>

        {/* Desktop : méga-menu */}
        <button
          type="button"
          className={cn(
            "hidden items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition hover:bg-white/10 lg:flex",
            megaOpen && "bg-brand-600 hover:bg-brand-600",
          )}
          aria-expanded={megaOpen}
          aria-controls={megaId}
          onClick={() => setMegaOpen((o) => !o)}
        >
          <LayoutGrid className="size-4.5" aria-hidden />
          Toutes nos catégories
          <ChevronDown
            className={cn("size-4 transition-transform", megaOpen && "rotate-180")}
            aria-hidden
          />
        </button>

        <ul className="scrollbar-none flex flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-sm">
          {tree.map((c) => (
            <li key={c.slug} className="hidden lg:block">
              <Link
                prefetch={false}
                href={`/categorie/${c.slug}`}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-white/85 hover:bg-white/10 hover:text-white",
                  pathname === `/categorie/${c.slug}` && "bg-white/10 text-white",
                )}
              >
                <CategoryIcon name={c.icon} className="size-4" />
                {c.name}
              </Link>
            </li>
          ))}
          <li>
            <Link
              prefetch={false}
              href="/promotions"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-white/85 hover:bg-white/10 hover:text-white"
            >
              <Tag className="text-brand-500 size-4" aria-hidden /> Promotions
            </Link>
          </li>
          <li>
            <Link
              prefetch={false}
              href="/promotions#ventes-flash"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-white/85 hover:bg-white/10 hover:text-white"
            >
              <Zap className="text-accent-400 size-4" aria-hidden /> Ventes flash
            </Link>
          </li>
          <li className="ml-auto hidden 2xl:block">
            <Link
              prefetch={false}
              href="/infos/contact"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-white/85 hover:bg-white/10 hover:text-white"
            >
              <Headset className="size-4" aria-hidden /> Service client
            </Link>
          </li>
        </ul>
      </div>

      {/* Panneau méga-menu */}
      {megaOpen && current && (
        <div
          id={megaId}
          className="absolute inset-x-0 top-full z-40 hidden border-t border-white/10 lg:block"
        >
          <div className="container-page">
            <div className="text-ink-900 grid grid-cols-[16rem_1fr] overflow-hidden rounded-b-2xl bg-white shadow-[var(--shadow-card-hover)]">
              <ul className="border-ink-100 bg-ink-50 border-r py-2">
                {tree.map((c, i) => (
                  <li key={c.slug}>
                    <Link
                      prefetch={false}
                      href={`/categorie/${c.slug}`}
                      onMouseEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 text-sm font-medium",
                        i === active ? "text-brand-600 bg-white" : "hover:bg-white",
                      )}
                    >
                      <CategoryIcon name={c.icon} className="size-4.5" />
                      <span className="flex-1">{c.name}</span>
                      <ChevronRight className="text-ink-400 size-4" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-3 gap-x-8 gap-y-6 p-6">
                {current.children.map((sub) => (
                  <div key={sub.slug}>
                    <Link
                      prefetch={false}
                      href={`/categorie/${sub.slug}`}
                      className="text-brand-600 mb-2 flex items-center gap-2 text-sm font-bold hover:underline"
                    >
                      <CategoryIcon name={sub.icon} className="size-4" />
                      {sub.name}
                    </Link>
                    <ul className="space-y-1.5">
                      {sub.children.slice(0, 6).map((leaf) => (
                        <li key={leaf.slug}>
                          <Link
                            prefetch={false}
                            href={`/categorie/${leaf.slug}`}
                            className="text-ink-700 hover:text-brand-600 text-sm"
                          >
                            {leaf.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <Link
                  prefetch={false}
                  href="/promotions"
                  className="from-accent-300 to-accent-500 text-ink-900 flex flex-col justify-between rounded-xl bg-gradient-to-br p-4"
                >
                  <span className="bg-ink-900 text-accent-400 w-fit rounded-full px-2 py-0.5 text-xs font-bold">
                    Jusqu&apos;à -20 %
                  </span>
                  <span className="font-display mt-6 text-lg font-extrabold leading-tight">
                    Offres du moment
                  </span>
                  <span className="mt-1 text-sm font-semibold underline">Découvrir</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tiroir mobile */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-[60] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu des catégories"
        >
          <button
            type="button"
            className="bg-ink-900/60 absolute inset-0"
            aria-label="Fermer le menu"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="text-ink-900 absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-white shadow-xl">
            <div className="border-ink-100 flex items-center justify-between border-b px-4 py-3">
              <p className="font-display text-lg font-bold">Catégories</p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="hover:bg-ink-50 rounded-lg p-2"
                aria-label="Fermer le menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {tree.map((c) => (
                <details key={c.slug} className="border-ink-100 group border-b">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 font-medium">
                    <CategoryIcon name={c.icon} className="text-brand-600 size-5" />
                    <span className="flex-1">{c.name}</span>
                    <ChevronDown
                      className="size-4 transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <ul className="bg-ink-50 pb-2">
                    <li>
                      <Link
                        prefetch={false}
                        href={`/categorie/${c.slug}`}
                        className="text-brand-600 block px-12 py-2 text-sm font-semibold"
                      >
                        Tout voir
                      </Link>
                    </li>
                    {c.children.map((sub) => (
                      <li key={sub.slug}>
                        <Link
                          prefetch={false}
                          href={`/categorie/${sub.slug}`}
                          className="block px-12 py-2 text-sm"
                        >
                          {sub.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
              <Link
                prefetch={false}
                href="/infos/contact"
                className="flex items-center gap-3 px-4 py-3 font-medium"
              >
                <Headset className="text-brand-600 size-5" aria-hidden /> Service client
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
