"use client";

import { ChevronDown, CircleUser, MapPin } from "lucide-react";
import Link from "next/link";
import { useDeliveryLocation } from "@/components/providers/LocationProvider";
import { MiniCart } from "@/components/cart/MiniCart";

export function LocationButton() {
  const { city, location, openModal } = useDeliveryLocation();
  return (
    <button
      type="button"
      onClick={openModal}
      className="hover:bg-ink-50 flex items-center gap-2 rounded-lg px-2 py-1 text-left"
      aria-haspopup="dialog"
    >
      <MapPin className="text-brand-600 size-5 shrink-0" aria-hidden />
      <span className="hidden leading-tight xl:block">
        <span className="text-ink-500 block text-[0.7rem]">Livrer à</span>
        <span className="block max-w-36 truncate text-sm font-semibold">
          {city
            ? `${city.name}${location?.neighborhood ? `, ${location.neighborhood}` : ""}`
            : "Choisir ma ville"}
        </span>
      </span>
      <span className="sr-only xl:hidden">Choisir ma ville de livraison</span>
    </button>
  );
}

export function AccountLink() {
  return (
    <Link href="/compte" className="hover:bg-ink-50 flex items-center gap-2 rounded-lg px-2 py-1">
      <CircleUser className="text-ink-700 size-6" aria-hidden />
      <span className="hidden leading-tight lg:block">
        <span className="text-ink-500 block text-[0.7rem]">Bonjour,</span>
        <span className="flex items-center text-sm font-semibold">
          Mon compte <ChevronDown className="ml-0.5 size-3.5" aria-hidden />
        </span>
      </span>
      <span className="sr-only lg:hidden">Mon compte</span>
    </Link>
  );
}

export function HeaderActions() {
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <LocationButton />
      <AccountLink />
      <MiniCart />
    </div>
  );
}
