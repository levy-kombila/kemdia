"use client";

import { ChevronDown, CircleUser, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { clearStaleSessionAction, logoutAction } from "@/lib/auth/actions";

/** `"loading"` : l'en-tête attend encore l'API (S4-T08, démo qui se réveille) — emplacement réservé, rien de cliquable. */
export type HeaderAccount = { firstName: string } | null | "loading";

/** Lien « Se connecter » : après la connexion, retour à la page où l'on était. */
function SignInLink() {
  const pathname = usePathname();
  const href =
    pathname && pathname !== "/"
      ? `/connexion?retour=${encodeURIComponent(pathname)}`
      : "/connexion";
  return (
    <Link href={href} className="hover:bg-ink-50 flex items-center gap-2 rounded-lg px-2 py-1">
      <CircleUser className="text-ink-700 size-6" aria-hidden />
      <span className="hidden leading-tight lg:block">
        <span className="text-ink-500 block text-[0.7rem]">Bonjour,</span>
        <span className="block text-sm font-semibold">Se connecter</span>
      </span>
      <span className="sr-only lg:hidden">Se connecter</span>
    </Link>
  );
}

/** Menu du client connecté : « Bonjour, Awa » → Mon compte, Se déconnecter. */
function SignedInMenu({ firstName }: { firstName: string }) {
  // Page où le menu a été ouvert : sur une autre page, il est fermé (aucun effet à synchroniser)
  const pathname = usePathname();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn !== null && openedOn === pathname;
  const close = () => setOpenedOn(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Fermeture : clic ailleurs, touche Échap (le focus revient au bouton)
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenedOn(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenedOn(null);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      // Le focus passe à un autre élément hors du menu (touche Tab) : il se ferme. Sans élément
      // suivant (clic sur une zone neutre, ou Safari qui ne donne pas le focus aux boutons), on laisse
      // le clic ailleurs gérer la fermeture, pour ne pas perdre un clic sur « Se déconnecter ».
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (open && next && !rootRef.current?.contains(next)) close();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : setOpenedOn(pathname))}
        className="hover:bg-ink-50 flex items-center gap-2 rounded-lg px-2 py-1 text-left"
      >
        <CircleUser className="text-brand-600 size-6" aria-hidden />
        <span className="hidden leading-tight lg:block">
          <span className="text-ink-500 block text-[0.7rem]">Bonjour,</span>
          <span className="flex items-center text-sm font-semibold">
            <span className="max-w-28 truncate">{firstName}</span>
            <ChevronDown className="ml-0.5 size-3.5" aria-hidden />
          </span>
        </span>
        <span className="sr-only lg:hidden">Mon compte ({firstName})</span>
      </button>
      {open && (
        <div
          id={menuId}
          className="border-ink-100 absolute right-0 z-50 mt-2 w-52 rounded-xl border bg-white p-1.5 shadow-lg"
        >
          <p className="text-ink-500 px-3 py-2 text-xs">
            Connecté en tant que <strong className="text-ink-800">{firstName}</strong>
          </p>
          <Link
            href="/compte"
            onClick={close}
            className="hover:bg-ink-50 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
          >
            <UserRound className="size-4" aria-hidden /> Mon compte
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="hover:bg-ink-50 text-brand-700 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium"
            >
              <LogOut className="size-4" aria-hidden /> Se déconnecter
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Efface, une seule fois, un cookie de session que l'API refuse (session expirée ou fermée ailleurs). */
export function StaleSessionCleaner() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void clearStaleSessionAction().catch(() => undefined);
  }, []);
  return null;
}

/** Même place que « Se connecter », sans texte : rien ne bouge quand le vrai menu arrive. */
function AccountPlaceholder() {
  return (
    <span className="flex items-center gap-2 px-2 py-1" aria-hidden>
      <CircleUser className="text-ink-300 size-6" />
      <span className="hidden leading-tight lg:block">
        <span className="bg-ink-100 block h-2.5 w-12 rounded" />
        <span className="bg-ink-100 mt-1 block h-3.5 w-20 rounded" />
      </span>
    </span>
  );
}

export function AccountMenu({ account }: { account: HeaderAccount }) {
  if (account === "loading") return <AccountPlaceholder />;
  return account ? <SignedInMenu firstName={account.firstName} /> : <SignInLink />;
}
