"use client";

import { MapPin, Truck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/providers/CartProvider";
import { useDeliveryLocation } from "@/components/providers/LocationProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { CITIES, COUNTRY, estimateDelivery, formatDelay, getCity } from "@/lib/delivery";
import { formatFCFA } from "@/lib/format";

/**
 * Choix de la ville de livraison — Gabon uniquement (zone de couverture phase 1).
 * Remplace location_modal.html : plus d'appel à un service de géolocalisation IP externe
 * (MED-06 / MED-14), plus de redirection construite depuis l'URL (MED-01).
 * Implémentée avec <dialog> natif : gestion du focus et de la touche Échap par le navigateur.
 */
export function LocationModal() {
  const { isModalOpen, closeModal, location, setLocation } = useDeliveryLocation();
  const { subtotal } = useCart();
  const { notify } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [cityId, setCityId] = useState(location?.cityId ?? "");
  const [neighborhood, setNeighborhood] = useState(location?.neighborhood ?? "");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isModalOpen && !dialog.open) {
      setCityId(location?.cityId ?? "");
      setNeighborhood(location?.neighborhood ?? "");
      dialog.showModal();
    } else if (!isModalOpen && dialog.open) {
      dialog.close();
    }
  }, [isModalOpen, location]);

  const city = getCity(cityId);
  const estimate = city ? estimateDelivery(city.id, subtotal) : null;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!city) return;
    setLocation({ cityId: city.id, neighborhood: neighborhood || null });
    notify(`Livraison à ${city.name}${neighborhood ? ` (${neighborhood})` : ""}`);
    closeModal();
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={closeModal}
      onClick={(e) => e.target === dialogRef.current && closeModal()}
      aria-labelledby="location-title"
      className="backdrop:bg-ink-900/60 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl p-0 shadow-2xl"
    >
      <form onSubmit={onSubmit} className="p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="location-title" className="flex items-center gap-2 text-xl font-bold">
              <MapPin className="text-brand-600 size-5" aria-hidden /> Où souhaitez-vous être livré
              ?
            </h2>
            <p className="text-ink-500 mt-1 text-sm">
              Nous livrons actuellement partout au {COUNTRY.name} 🇬🇦
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="text-ink-400 hover:bg-ink-50 hover:text-ink-900 rounded-lg p-1.5"
            aria-label="Fermer"
          >
            <X className="size-5" />
          </button>
        </div>

        <label htmlFor="city" className="mb-1.5 block text-sm font-semibold">
          Ville
        </label>
        <select
          id="city"
          value={cityId}
          onChange={(e) => {
            setCityId(e.target.value);
            setNeighborhood("");
          }}
          required
          className="border-ink-200 focus:border-brand-500 focus:ring-brand-100 mb-4 h-11 w-full rounded-xl border bg-white px-3 text-sm focus:outline-none focus:ring-4"
        >
          <option value="">Sélectionnez votre ville</option>
          {CITIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label htmlFor="neighborhood" className="mb-1.5 block text-sm font-semibold">
          Quartier <span className="text-ink-500 font-normal">(facultatif)</span>
        </label>
        <select
          id="neighborhood"
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
          disabled={!city}
          className="border-ink-200 focus:border-brand-500 focus:ring-brand-100 disabled:bg-ink-50 disabled:text-ink-400 mb-5 h-11 w-full rounded-xl border bg-white px-3 text-sm focus:outline-none focus:ring-4"
        >
          <option value="">
            {city ? "Sélectionnez votre quartier" : "Choisissez d'abord une ville"}
          </option>
          {city?.neighborhoods.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        {estimate && (
          <div className="bg-ink-50 mb-5 rounded-xl p-4 text-sm" aria-live="polite">
            <p className="mb-2 flex items-center gap-2 font-semibold">
              <Truck className="text-brand-600 size-4" aria-hidden /> Livraison estimée
            </p>
            <dl className="grid grid-cols-2 gap-y-1">
              <dt className="text-ink-500">Frais</dt>
              <dd className={estimate.isFree ? "text-success-600 font-semibold" : "font-semibold"}>
                {estimate.isFree ? "Gratuite" : formatFCFA(estimate.fee)}
              </dd>
              <dt className="text-ink-500">Délai</dt>
              <dd className="font-semibold">{formatDelay(estimate.daysMin, estimate.daysMax)}</dd>
            </dl>
            {estimate.remainingForFree > 0 && (
              <p className="text-ink-500 mt-2 text-xs">
                Plus que <strong>{formatFCFA(estimate.remainingForFree)}</strong> d&apos;achats pour
                la livraison gratuite.
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={!city}
          className="bg-brand-600 hover:bg-brand-700 disabled:bg-ink-200 disabled:text-ink-500 h-12 w-full rounded-full font-semibold text-white transition disabled:cursor-not-allowed"
        >
          Enregistrer ma ville
        </button>
      </form>
    </dialog>
  );
}
