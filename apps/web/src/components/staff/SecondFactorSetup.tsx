"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Field, FormAlert, PasswordField, SubmitButton } from "@/components/ui/Field";
import {
  enableSecondFactorAction,
  setupSecondFactorAction,
  type SetupResult,
} from "@/lib/staff/actions";
import { RecoveryCodes } from "./RecoveryCodes";

type Shown = Extract<SetupResult, { ok: true }>;
type Step =
  { name: "password" } | { name: "scan"; setup: Shown } | { name: "codes"; codes: string[] };

const UNAVAILABLE = "Service momentanément indisponible. Réessayez dans quelques instants.";
/** S9-T01 : un clic sans mot de passe ne restait pas sans réponse. */
const PASSWORD_MISSING =
  "Saisissez le mot de passe de votre compte Kemdia (celui choisi à l'inscription).";

/** Secret découpé par groupes de 4 : plus facile à recopier à la main. */
const grouped = (secret: string) => secret.match(/.{1,4}/g)?.join(" ") ?? secret;

/**
 * Activation de la double authentification (S6-T05, ADR-0034 et 0036), en trois étapes :
 * 1. le mot de passe (une session volée ne suffit pas) ; 2. le QR code, dessiné par le serveur, et un premier code ;
 * 3. les codes de secours, montrés une seule fois. Le secret n'existe que dans la mémoire de cette page.
 */
export function SecondFactorSetup() {
  const [step, setStep] = useState<Step>({ name: "password" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [alert, setAlert] = useState<{ message: string; signedOut?: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const showSecret = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!password) {
      // Focus sur le champ : le lecteur d'écran lit le message qui le décrit (relecture S9-T01)
      setPasswordError(PASSWORD_MISSING);
      return passwordRef.current?.focus();
    }
    setPasswordError(null);
    setPending(true);
    setAlert(null);
    const result = await setupSecondFactorAction(password).catch(() => null);
    setPending(false);
    setPassword("");
    if (!result) return setAlert({ message: UNAVAILABLE });
    if (!result.ok) return setAlert(result);
    setStep({ name: "scan", setup: result });
  };

  const enable = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setAlert(null);
    const result = await enableSecondFactorAction(code).catch(() => null);
    setPending(false);
    setCode("");
    if (!result) return setAlert({ message: UNAVAILABLE });
    if (!result.ok) {
      setAlert(result);
      return codeRef.current?.focus();
    }
    setStep({ name: "codes", codes: result.recoveryCodes });
  };

  const alertBox = alert && (
    <FormAlert>
      {alert.message}{" "}
      {alert.signedOut && (
        <Link href="/connexion?retour=/equipe" className="font-semibold underline">
          Se reconnecter
        </Link>
      )}
    </FormAlert>
  );

  if (step.name === "codes") {
    return (
      <section aria-labelledby="codes-titre" className="space-y-3 rounded-xl bg-white p-6">
        <h2 id="codes-titre" className="text-lg font-extrabold">
          Double authentification activée
        </h2>
        <RecoveryCodes
          codes={step.codes}
          next={{ href: "/equipe", label: "Aller au tableau de bord" }}
        />
      </section>
    );
  }

  if (step.name === "scan") {
    const { qr, secret, otpauthUri } = step.setup;
    return (
      <section aria-labelledby="scan-titre" className="space-y-4 rounded-xl bg-white p-6">
        <h2 id="scan-titre" className="text-lg font-extrabold">
          2. Ajoutez Kemdia à votre application
        </h2>
        <p className="text-ink-700 text-sm">
          Ouvrez votre application d&apos;authentification (Google Authenticator, Microsoft
          Authenticator, Aegis, 2FAS…), choisissez « Ajouter » puis scannez ce QR code.
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <svg
            role="img"
            aria-label="QR code de la double authentification"
            viewBox={`0 0 ${qr.size} ${qr.size}`}
            shapeRendering="crispEdges"
            className="border-ink-200 size-56 shrink-0 rounded-lg border bg-white"
          >
            <rect width={qr.size} height={qr.size} fill="#ffffff" />
            <path d={qr.path} fill="#000000" />
          </svg>
          <div className="min-w-0 space-y-2 text-sm">
            <p>
              <strong>Sur ce téléphone ?</strong>{" "}
              <a href={otpauthUri} className="text-brand-700 font-semibold underline">
                Ouvrir dans l&apos;application
              </a>
            </p>
            <p>Le QR code ne passe pas ? Saisissez cette clé à la main :</p>
            <p className="bg-ink-50 select-all break-all rounded-lg px-3 py-2 font-mono text-base tracking-wider">
              {grouped(secret)}
            </p>
          </div>
        </div>
        <form onSubmit={enable} noValidate className="space-y-4">
          {alertBox}
          <Field
            ref={codeRef}
            label="Code à 6 chiffres affiché par l'application"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
          />
          <SubmitButton pending={pending}>Activer la double authentification</SubmitButton>
        </form>
      </section>
    );
  }

  return (
    <section aria-labelledby="mdp-titre" className="space-y-4 rounded-xl bg-white p-6">
      <h2 id="mdp-titre" className="text-lg font-extrabold">
        1. Confirmez votre mot de passe
      </h2>
      <p className="text-ink-700 text-sm">
        Avant d&apos;afficher le QR code, nous vérifions que c&apos;est bien vous avec le mot de
        passe de votre compte. Un e-mail vous préviendra.
      </p>
      <form onSubmit={showSecret} noValidate className="space-y-4">
        {alertBox}
        <PasswordField
          ref={passwordRef}
          label="Mot de passe"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setPasswordError(null);
          }}
          error={passwordError}
          hint="Celui de votre compte Kemdia, choisi à l'inscription : aucun mot de passe n'est envoyé par e-mail."
          maxLength={128}
          required
        />
        <SubmitButton pending={pending}>Afficher le QR code</SubmitButton>
      </form>
    </section>
  );
}
