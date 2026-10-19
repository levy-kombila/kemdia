"use client";

import { CircleCheck, Mail, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { authClient, type AuthResult, type CodeSent, type SignedIn } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/messages";
import { normalizeEmail, normalizeName } from "@/lib/auth/validation";
import { cn } from "@/lib/cn";
import { Field, FormAlert, PasswordField, SubmitButton } from "@/components/ui/Field";
import { OtpStep } from "./OtpStep";
import { PasswordRules, passwordError } from "./PasswordRules";

type Channel = "phone" | "email";
type Errors = Partial<
  Record<"firstName" | "lastName" | "contact" | "password" | "terms" | "adult", string>
>;
type Step =
  | { name: "form" }
  | { name: "otp"; email: string; sent: CodeSent }
  | { name: "done"; email: string; firstName: string };

/** Le SMS n'a pas encore de fournisseur (SMS_ENABLED=false) : l'option est affichée, mais pas encore active. */
const SMS_SOON = "L'inscription par SMS sera bientôt disponible.";

export function SignupForm() {
  const [step, setStep] = useState<Step>({ name: "form" });
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>("email");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  // « J'ai 18 ans ou plus » (S7-T08, loi 001/2011 modifiée art. 74) : case DISTINCTE des conditions
  const [adult, setAdult] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // Après l'affichage des erreurs, place le curseur sur le premier champ invalide
  useEffect(() => {
    if (focusRequest) formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
  }, [focusRequest]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const first = normalizeName(firstName);
    const last = normalizeName(lastName);
    const email = channel === "email" ? normalizeEmail(contact) : null;
    const next: Errors = {};
    if (!first) next.firstName = "Prénom requis (lettres, espaces, apostrophes ou tirets).";
    if (!last) next.lastName = "Nom requis (lettres, espaces, apostrophes ou tirets).";
    if (!email) next.contact = channel === "phone" ? SMS_SOON : "Adresse e-mail invalide.";
    const pwError = passwordError(password);
    if (pwError) next.password = pwError;
    if (!terms) next.terms = "Vous devez accepter les conditions pour créer un compte.";
    if (!adult) next.adult = "Kemdia est réservé aux personnes de 18 ans ou plus.";
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length > 0 || !first || !last || !email) {
      setFocusRequest((n) => n + 1);
      return;
    }
    setPending(true);
    const result = await authClient
      .signup({
        firstName: first,
        lastName: last,
        identifier: email,
        password,
        acceptTerms: true,
        adult: true,
      })
      .catch((): AuthResult<CodeSent> => ({ ok: false, code: "INDISPONIBLE" }));
    setPending(false);
    if (result.ok) {
      setStep({ name: "otp", email, sent: result });
      return;
    }
    // Erreurs de saisie refusées par le serveur : affichées sous le bon champ
    const field: keyof Errors | null =
      result.code === "NOM_INVALIDE"
        ? "firstName"
        : result.code === "IDENTIFIANT_INVALIDE" || result.code === "CANAL_INDISPONIBLE"
          ? "contact"
          : result.code === "MOT_DE_PASSE_FAIBLE"
            ? "password"
            : null;
    if (field) {
      setErrors({ [field]: authErrorMessage(result) });
      setFocusRequest((n) => n + 1);
    } else setFailure(authErrorMessage(result));
  };

  if (step.name === "otp") {
    return (
      <OtpStep
        sent={step.sent}
        onBack={() => setStep({ name: "form" })}
        onResend={() => authClient.resendSignup()}
        onSubmit={async (code) => {
          const result: SignedIn = await authClient.verifySignup(code);
          if (result.ok) {
            setPassword("");
            setStep({ name: "done", email: step.email, firstName: result.account.firstName });
            // L'en-tête se met à jour : le client est connecté
            router.refresh();
          }
          return result;
        }}
      />
    );
  }

  if (step.name === "done") {
    return (
      <div className="text-center" role="status">
        <CircleCheck className="text-success-600 mx-auto size-16" aria-hidden />
        <h2 className="mt-3 text-xl font-extrabold">Bienvenue chez Kemdia, {step.firstName} !</h2>
        <p className="text-ink-500 mt-2">
          Votre adresse {step.email} est vérifiée et vous êtes connecté.
        </p>
        <Link
          href="/"
          className="bg-brand-600 hover:bg-brand-700 mt-6 inline-block rounded-full px-6 py-3 font-semibold text-white"
        >
          Commencer mes achats
        </Link>
      </div>
    );
  }

  const switchChannel = (c: Channel) => {
    setChannel(c);
    setContact("");
    setErrors((prev) => ({ ...prev, contact: undefined }));
  };

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-5">
      {failure && <FormAlert>{failure}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Prénom"
          name="given-name"
          autoComplete="given-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          error={errors.firstName}
          maxLength={60}
        />
        <Field
          label="Nom"
          name="family-name"
          autoComplete="family-name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          error={errors.lastName}
          maxLength={60}
        />
      </div>

      <fieldset>
        <legend className="text-ink-800 mb-1.5 text-sm font-semibold">
          Recevoir le code de vérification par
        </legend>
        <div className="bg-ink-50 grid grid-cols-2 gap-1 rounded-xl p-1">
          {(
            [
              ["email", "E-mail", Mail, false],
              ["phone", "SMS", Smartphone, true],
            ] as const
          ).map(([value, label, Icon, soon]) => (
            <label
              key={value}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition has-[:focus-visible]:outline-2",
                soon ? "text-ink-400 cursor-not-allowed" : "cursor-pointer",
                channel === value ? "text-brand-700 bg-white shadow-sm" : !soon && "text-ink-500",
              )}
            >
              <input
                type="radio"
                name="channel"
                value={value}
                checked={channel === value}
                disabled={soon}
                onChange={() => switchChannel(value)}
                className="sr-only"
              />
              <Icon className="size-4" aria-hidden /> {label}
              {soon && (
                <span className="bg-accent-400/25 text-ink-700 rounded-full px-1.5 text-[0.65rem] font-bold">
                  bientôt
                </span>
              )}
            </label>
          ))}
        </div>
      </fieldset>

      {channel === "email" && (
        <Field
          key="email"
          label="Adresse e-mail"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="nom@exemple.ga"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          error={errors.contact}
          hint="Le code de vérification arrive par e-mail."
          maxLength={254}
        />
      )}

      <PasswordField
        label="Mot de passe"
        name="new-password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        hint={<PasswordRules password={password} />}
        maxLength={128}
      />

      <div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            aria-invalid={errors.terms ? true : undefined}
            aria-describedby={errors.terms ? "terms-error" : undefined}
            className="accent-brand-600 mt-0.5 size-5 shrink-0"
          />
          <span className="text-ink-700">
            J&apos;accepte les{" "}
            <Link
              href="/infos/cgv"
              className="text-brand-700 font-semibold underline"
              target="_blank"
            >
              conditions générales de vente
            </Link>{" "}
            et la{" "}
            <Link
              href="/infos/confidentialite"
              className="text-brand-700 font-semibold underline"
              target="_blank"
            >
              politique de confidentialité
            </Link>
            .
          </span>
        </label>
        {errors.terms && (
          <p id="terms-error" className="text-brand-700 mt-1.5 text-sm font-medium">
            {errors.terms}
          </p>
        )}
      </div>

      <div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={adult}
            onChange={(e) => setAdult(e.target.checked)}
            aria-invalid={errors.adult ? true : undefined}
            aria-describedby={errors.adult ? "adult-error" : undefined}
            className="accent-brand-600 mt-0.5 size-5 shrink-0"
          />
          <span className="text-ink-700">J&apos;ai 18 ans ou plus.</span>
        </label>
        {errors.adult && (
          <p id="adult-error" className="text-brand-700 mt-1.5 text-sm font-medium">
            {errors.adult}
          </p>
        )}
      </div>

      <SubmitButton pending={pending}>Créer mon compte</SubmitButton>
      <p className="text-ink-500 text-center text-sm">
        Déjà client ?{" "}
        <Link href="/connexion" className="text-brand-700 font-semibold">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
