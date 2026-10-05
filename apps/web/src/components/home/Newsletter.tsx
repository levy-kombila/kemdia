"use client";

import { Mail } from "lucide-react";
import { useToast } from "@/components/providers/ToastProvider";

/**
 * Inscription newsletter — l'envoi réel sera branché sur l'API au Sprint 4
 * (double opt-in, consentement explicite, conforme à la loi gabonaise n°001/2011 sur les données personnelles).
 */
export function Newsletter() {
  const { notify } = useToast();
  return (
    <section className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-white p-6 shadow-[var(--shadow-card)] md:flex-row md:items-center md:p-8">
      <div>
        <h2 className="text-xl font-extrabold">
          Ne ratez aucune <span className="text-brand-600">offre</span>
        </h2>
        <p className="text-ink-500 text-sm">
          Promotions, nouveautés et ventes flash directement dans votre boîte mail.
        </p>
      </div>
      <form
        className="flex w-full max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          notify("Merci ! La newsletter sera activée très prochainement.");
          e.currentTarget.reset();
        }}
      >
        <label htmlFor="newsletter-email" className="sr-only">
          Adresse e-mail
        </label>
        <div className="relative flex-1">
          <Mail
            className="text-ink-400 absolute left-4 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            id="newsletter-email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder="Votre adresse e-mail"
            className="border-ink-200 focus:border-brand-500 focus:ring-brand-100 h-12 w-full rounded-full border pl-10 pr-4 text-sm focus:outline-none focus:ring-4"
          />
        </div>
        <button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700 h-12 rounded-full px-6 font-semibold text-white"
        >
          S&apos;inscrire
        </button>
      </form>
    </section>
  );
}
