import { Check, Circle } from "lucide-react";
import { PASSWORD_RULES, passwordIssues } from "@/lib/auth/validation";
import { cn } from "@/lib/cn";

export function PasswordRules({ password }: { password: string }) {
  const issues = passwordIssues(password);
  return (
    <ul className="mt-1 grid gap-1 sm:grid-cols-3">
      {PASSWORD_RULES.map(({ issue, label }) => {
        const ok = password.length > 0 && !issues.includes(issue);
        return (
          <li
            key={issue}
            className={cn(
              "flex items-center gap-1.5 text-xs",
              ok ? "text-success-600" : "text-ink-500",
            )}
          >
            {ok ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Circle className="size-3" aria-hidden />
            )}
            {label}
            <span className="sr-only">{ok ? " : respecté" : " : à respecter"}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function passwordError(password: string): string | null {
  const issues = passwordIssues(password);
  if (issues.length === 0) return null;
  if (issues.includes("max")) return "Mot de passe trop long (128 caractères maximum).";
  if (issues.includes("common")) return "Ce mot de passe est trop courant. Choisissez-en un autre.";
  return "Le mot de passe ne respecte pas toutes les règles.";
}
