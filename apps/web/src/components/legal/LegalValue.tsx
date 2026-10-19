import { TO_COMPLETE } from "@/lib/legal";

/** Valeur légale fournie par le client, ou « à compléter » bien visible (jamais une valeur inventée). */
export function LegalValue({ value }: { value: string | null }) {
  return value ? (
    <>{value}</>
  ) : (
    <span className="bg-accent-400/20 rounded px-1 font-semibold">{TO_COMPLETE}</span>
  );
}
