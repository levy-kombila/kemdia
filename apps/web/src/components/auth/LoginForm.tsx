"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { parseIdentifier } from "@/lib/auth/validation";
import { Field, FormAlert, PasswordField, SubmitButton } from "./Field";

type Errors = { identifier?: string; password?: string };

export function LoginForm({ returnTo }: { returnTo: string }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const idRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const id = parseIdentifier(identifier);
    const next: Errors = {};
    if (!id)
      next.identifier = "Saisissez un e-mail valide ou un numéro gabonais (ex. 077 12 34 56).";
    if (!password) next.password = "Saisissez votre mot de passe.";
    setErrors(next);
    setNotice(null);
    if (next.identifier) return idRef.current?.focus();
    if (next.password || !id) return pwRef.current?.focus();

    setPending(true);
    const result = await authClient.login(id, password);
    setPending(false);
    setPassword("");
    if (result.ok) {
      window.location.assign(returnTo);
    } else if (result.error === "unavailable") {
      setNotice("unavailable");
    } else {
      // Message volontairement identique que l'identifiant existe ou non (pas d'énumération des comptes)
      setErrors({ password: "Identifiant ou mot de passe incorrect." });
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {notice && (
        <FormAlert tone="info">
          <strong>Mode démonstration</strong> : la connexion sera active au Sprint 4, quand le
          serveur Kemdia sera en place. Vous pouvez déjà{" "}
          <Link href="/inscription" className="font-semibold underline">
            tester l&apos;inscription
          </Link>
          .
        </FormAlert>
      )}
      <Field
        ref={idRef}
        label="E-mail ou numéro de téléphone"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="077 12 34 56 ou nom@exemple.ga"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        error={errors.identifier}
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
