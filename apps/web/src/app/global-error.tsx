"use client";

/**
 * Dernier filet de sécurité : erreur dans le gabarit commun lui-même (rare — l'en-tête tolère déjà une panne
 * du catalogue). Page autonome, sans détail technique, avec son propre <html>.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr-GA">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
          textAlign: "center",
          color: "#14181e",
        }}
      >
        <main>
          <h1 style={{ fontSize: "1.5rem" }}>Kemdia est momentanément indisponible</h1>
          <p>Veuillez réessayer dans quelques instants.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "1rem",
              padding: "0.75rem 1.5rem",
              borderRadius: 999,
              border: 0,
              background: "#d61f2c",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
