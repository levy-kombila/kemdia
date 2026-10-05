"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SortSelect({ value, options }: { value: string; options: Record<string, string> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-500">Trier par</span>
      <select
        value={value}
        onChange={(e) => {
          const sp = new URLSearchParams(searchParams.toString());
          if (e.target.value === "pertinence") sp.delete("tri");
          else sp.set("tri", e.target.value);
          sp.delete("page");
          const qs = sp.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname);
        }}
        className="border-ink-200 focus:border-brand-500 h-10 rounded-full border bg-white px-4 font-medium focus:outline-none"
      >
        {Object.entries(options).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
