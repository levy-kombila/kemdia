import { avatarColorOf, avatarSrc, initialsOf } from "@/lib/avatar";
import { cn } from "@/lib/cn";

/**
 * Photo de profil (S7.5-T08, ADR-0055) : la photo du compte connecté, ou ses initiales sur une couleur qui lui est
 * propre. Image décorative (`alt=""`) : le nom est toujours écrit à côté ou annoncé par le bouton qui la contient.
 */
export function Avatar({
  firstName,
  lastName,
  version,
  size = 24,
  className,
}: {
  firstName: string;
  lastName: string;
  version: string | null;
  size?: number;
  className?: string;
}) {
  const src = avatarSrc(version);
  const style = { width: size, height: size };
  if (src) {
    return (
      // Photo privée, servie par le site avec la session : pas d'optimiseur d'images (ni copie partagée)
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        decoding="async"
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 select-none place-items-center rounded-full font-bold text-white",
        className,
      )}
      style={{
        ...style,
        backgroundColor: avatarColorOf(firstName, lastName),
        fontSize: Math.max(10, Math.round(size * 0.4)),
      }}
    >
      {initialsOf(firstName, lastName)}
    </span>
  );
}
