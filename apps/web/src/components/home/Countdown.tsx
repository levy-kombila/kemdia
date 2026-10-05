"use client";

import { useEffect, useState } from "react";

function untilMidnight(now: Date) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const diff = Math.max(0, end.getTime() - now.getTime());
  return {
    h: Math.floor(diff / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1000),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Compte à rebours jusqu'à minuit (heure locale). Rendu « --:--:-- » côté serveur pour éviter un écart d'hydratation. */
export function Countdown() {
  const [t, setT] = useState<ReturnType<typeof untilMidnight> | null>(null);

  useEffect(() => {
    const tick = () => setT(untilMidnight(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const cells: [string, string][] = [
    [t ? pad(t.h) : "--", "Heures"],
    [t ? pad(t.m) : "--", "Min"],
    [t ? pad(t.s) : "--", "Sec"],
  ];

  return (
    <div
      className="flex gap-2"
      role="timer"
      aria-label="Temps restant avant la fin des ventes flash"
    >
      {cells.map(([v, label]) => (
        <div key={label} className="bg-ink-900/85 w-14 rounded-lg py-1.5 text-center text-white">
          <span className="font-display block text-xl font-bold tabular-nums">{v}</span>
          <span className="block text-[0.6rem] uppercase tracking-wide opacity-80">{label}</span>
        </div>
      ))}
    </div>
  );
}
