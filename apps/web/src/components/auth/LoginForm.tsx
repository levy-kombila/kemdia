"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { authClient, type SignedIn } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/messages";
import { parseIdentifier } from "@/lib/auth/validation";
import { Field, FormAlert, PasswordField, SubmitButton } from "@/components/ui/Field";

type Errors = { identifier?: string; password?: string };

export const PHONE_SOON =
  "La connexion par numéro de téléphone sera bientôt disponible. Utilisez votre adresse e-mail.";

export function LoginForm({ returnTo, notice }: { returnTo: string; notice?: string | null }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const idRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const id = parseIdentifier(identifier);
    const next: Errors = {};
    if (!id) next.identifier = "Saisissez une adresse e-mail valide.";
    else if (id.kind === "phone") next.identifier = PHONE_SOON;
    if (!password) next.password = "Saisissez votre mot de passe.";
    setErrors(next);
    setAlert(null);
    if (next.identifier) return idRef.current?.focus();
    if (next.password || !id) return pwRef.current?.focus();

    setPending(true);
    const result = await authClient
      .login(id.value, password)
      .catch((): SignedIn => ({ ok: false, code: "INDISPONIBLE" }));
    if (result.ok) {
      // Rechargement complet : l'en-tête affiche aussitôt « Bonjour, … »
      window.location.assign(returnTo);
      return;
    }
    setPending(false);
    setPassword("");
    if (result.code === "IDENTIFIANTS_INCORRECTS") {
      // Message volontairement identique que l'identifiant existe ou non (pas d'énumération des comptes)
      setErrors({ password: authErrorMessage(result) });
      pwRef.current?.focus();
    } else {
      setAlert(authErrorMessage(result));
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {notice && !alert && <FormAlert tone="info">{notice}</FormAlert>}
      {alert && (
        <FormAlert>
          {alert}{" "}
          {alert.includes("Mot de passe oublié") && (
            <Link href="/mot-de-passe-oublie" className="font-semibold underline">
              Choisir un nouveau mot de passe
            </Link>
          )}
        </FormAlert>
      )}
      <Field
        ref={idRef}
        label="Adresse e-mail"
        name="username"
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="nom@exemple.ga"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        error={errors.identifier}
        hint="Connexion par numéro de téléphone : bientôt disponible."
        maxLength={254}
      />
      <div>
        <PasswordField
          ref={pwRef}
          label="Mot de passe"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          maxLength={128}
        />
        <Link
          href="/mot-de-passe-oublie"
          className="text-brand-700 mt-2 inline-block text-sm font-semibold"
        >
          Mot de passe oublié ?
        </Link>
      </div>
      <SubmitButton pending={pending}>Se connecter</SubmitButton>
      <p className="text-ink-500 text-center text-sm">
        Nouveau sur Kemdia ?{" "}
        <Link href="/inscription" className="text-brand-700 font-semibold">
          Créer un compte
        </Link>
      </p>
    </form>
  );
}
