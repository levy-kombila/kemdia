"use client";

import { CircleCheck, Mail, Smartphone } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import {
  formatGabonPhone,
  normalizeEmail,
  normalizeGabonPhone,
  normalizeName,
  type Identifier,
} from "@/lib/auth/validation";
import { cn } from "@/lib/cn";
import { Field, FormAlert, PasswordField, SubmitButton } from "@/components/ui/Field";
import { OtpStep } from "./OtpStep";
import { PasswordRules, passwordError } from "./PasswordRules";

type Channel = "phone" | "email";
type Errors = Partial<Record<"firstName" | "lastName" | "contact" | "password" | "terms", string>>;
type Step =
  | { name: "form" }
  | { name: "otp"; identifier: Identifier }
  | { name: "done"; identifier: Identifier };

export function SignupForm() {
  const [step, setStep] = useState<Step>({ name: "form" });
  const [channel, setChannel] = useState<Channel>("phone");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState(false);
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
    let identifier: Identifier | null = null;
    if (channel === "phone") {
      const p = normalizeGabonPhone(contact);
      if (p) identifier = { kind: "phone", ...p };
    } else {
      const m = normalizeEmail(contact);
      if (m) identifier = { kind: "email", value: m };
    }
    const next: Errors = {};
    if (!first) next.firstName = "Prénom requis (lettres, espaces, apostrophes ou tirets).";
    if (!last) next.lastName = "Nom requis (lettres, espaces, apostrophes ou tirets).";
    if (!identifier)
      next.contact =
        channel === "phone"
          ? "Numéro Airtel (07…) ou Moov (06…) de 9 chiffres, ex. 077 12 34 56."
          : "Adresse e-mail invalide.";
    const pwError = passwordError(password);
    if (pwError) next.password = pwError;
    if (!terms) next.terms = "Vous devez accepter les conditions pour créer un compte.";
    setErrors(next);
    setFailure(false);
    if (Object.keys(next).length > 0 || !first || !last || !identifier) {
      setFocusRequest((n) => n + 1);
      return;
    }
    setPending(true);
    const result = await authClient.signup({
      firstName: first,
      lastName: last,
      identifier,
      password,
    });
    setPending(false);
    if (result.ok) setStep({ name: "otp", identifier });
    else setFailure(true);
  };

  if (step.name === "otp") {
    return (
      <OtpStep
        purpose="signup"
        identifier={step.identifier}
        onBack={() => setStep({ name: "form" })}
        onVerified={() => {
          setPassword("");
          setStep({ name: "done", identifier: step.identifier });
        }}
      />
    );
  }

  if (step.name === "done") {
    return (
      <div className="text-center" role="status">
        <CircleCheck className="text-success-600 mx-auto size-16" aria-hidden />
        <h2 className="mt-3 text-xl font-extrabold">
          Bienvenue chez Kemdia, {normalizeName(firstName)} !
        </h2>
        <p className="text-ink-500 mt-2">
          {step.identifier.kind === "phone"
            ? `Votre numéro ${formatGabonPhone(step.identifier.value)} est vérifié.`
            : `Votre adresse ${step.identifier.value} est vérifiée.`}
        </p>
        <div className="mt-4">
          <FormAlert tone="info">
            Mode démonstration : aucun compte n&apos;a réellement été créé. Les comptes seront
            enregistrés à partir du Sprint 4.
          </FormAlert>
        </div>
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
      {failure && (
        <FormAlert>
          Inscription impossible pour le moment. Réessayez dans quelques instants.
        </FormAlert>
      )}
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
              ["phone", "SMS", Smartphone],
              ["email", "E-mail", Mail],
            ] as const
          ).map(([value, label, Icon]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition has-[:focus-visible]:outline-2",
                channel === value ? "text-brand-700 bg-white shadow-sm" : "text-ink-500",
              )}
            >
              <input
                type="radio"
                name="channel"
                value={value}
                checked={channel === value}
                onChange={() => switchChannel(value)}
                className="sr-only"
              />
              <Icon className="size-4" aria-hidden /> {label}
            </label>
          ))}
        </div>
      </fieldset>

      {channel === "phone" ? (
        <Field
          key="phone"
          label="Numéro de téléphone"
          name="tel"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="077 12 34 56"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          error={errors.contact}
          hint="Airtel (07…) ou Moov (06…). Le code arrive par SMS."
          maxLength={20}
        />
      ) : (
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
