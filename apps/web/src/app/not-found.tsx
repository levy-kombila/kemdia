import { SearchX } from "lucide-react";
import Link from "next/link";
import { SearchForm } from "@/components/layout/SearchForm";

export default function NotFound() {
  return (
    <div className="container-page flex flex-col items-center py-20 text-center">
      <SearchX className="text-brand-600 size-16" aria-hidden />
      <p className="font-display text-ink-900 mt-4 text-6xl font-black">404</p>
      <h1 className="mt-2 text-2xl font-bold">Cette page est introuvable</h1>
      <p className="text-ink-500 mt-2 max-w-md">
        Le produit ou la page que vous cherchez n&apos;existe pas ou a été déplacé.
      </p>
      <SearchForm id="notfound-search" className="mt-6 max-w-md" />
      <Link
        href="/"
        className="bg-brand-600 hover:bg-brand-700 mt-6 rounded-full px-6 py-3 font-semibold text-white"
      >
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
