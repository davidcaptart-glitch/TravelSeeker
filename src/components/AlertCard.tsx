import { Bed, Bus, MapPin, PartyPopper, Plane } from "lucide-react";
import Link from "next/link";
import { ago, eur, monthLabel } from "@/lib/format";
import type { Alert, Match } from "@/lib/types";

export function destinationText(a: Alert) {
  const d = a.config.destination;
  if (d.kind === "place") return d.place.label.split(",")[0];
  return d.themes.length ? `Cualquier sitio · ${d.themes.join(", ")}` : "Cualquier sitio";
}

/** Estado de una alerta en palabras: buscando, pausada o con el viaje ya reservado. */
export function alertState(a: Alert, ms: Match[]) {
  if (ms.some((m) => m.status === "booked")) return { label: "Viaje reservado", tone: "good" as const };
  if (!a.active) return { label: "Pausada", tone: "off" as const };
  return { label: "Buscando", tone: "on" as const };
}

export function AlertCard({ a, ms, index = 0 }: { a: Alert; ms: Match[]; index?: number }) {
  const c = a.config;
  const open = ms.filter((m) => m.status === "new" || m.status === "saved");
  const best = open.length ? Math.min(...open.map((m) => m.totalPrice)) : null;
  const pending = ms.filter((m) => m.status === "new").length;
  const saved = ms.filter((m) => m.status === "saved").length;
  const st = alertState(a, ms);
  return (
    <Link
      href={`/alerts/${a.id}`}
      className="card animate-rise flex h-full min-w-0 flex-col gap-4 p-4 transition hover:-translate-y-0.5 sm:p-5"
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold text-muted">
            {st.tone === "on" ? (
              <span className="radar relative inline-block h-2 w-2 rounded-full bg-cyan text-cyan" />
            ) : st.tone === "good" ? (
              <PartyPopper className="h-3.5 w-3.5 text-good" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-muted/50" />
            )}
            <span className={st.tone === "good" ? "text-good" : ""}>{st.label}</span>
            <span aria-hidden>·</span>
            <span>{ago(a.lastRunAt)}</span>
          </p>
          <h3 className="mt-1 truncate text-lg font-bold">{c.name}</h3>
        </div>
        <div className="shrink-0 text-right">
          {best !== null ? (
            <>
              <p className="hint">desde</p>
              <p className="text-gradient text-xl font-extrabold tabular-nums">{eur(best)}</p>
            </>
          ) : (
            <p className="hint pt-1">{a.active ? "Aún nada" : "—"}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono font-semibold">{c.origins.join(" · ")}</span>
        <span className="h-px flex-1 bg-gradient-to-r from-cyan/50 to-magenta/50" />
        <Plane className="h-4 w-4 text-cyan" />
        <span className="h-px flex-1 bg-gradient-to-r from-cyan/50 to-magenta/50" />
        <span className="flex min-w-0 items-center gap-1 font-semibold">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-magenta" />
          <span className="truncate">{destinationText(a)}</span>
        </span>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {pending > 0 && <span className="badge bg-gradient-brand text-white">{pending} por decidir</span>}
        {saved > 0 && <span className="badge bg-accent-soft text-accent">{saved} guardadas</span>}
        <span className="badge bg-surface-2">≤ {eur(c.flight.maxPrice)}</span>
        <span className="badge bg-surface-2 capitalize">{c.dates.months.map(monthLabel).join(", ")}</span>
        {c.hotel && (
          <span className="badge bg-surface-2">
            <Bed className="h-3 w-3" /> alojamiento
          </span>
        )}
        {c.allowGround && (
          <span className="badge bg-surface-2">
            <Bus className="h-3 w-3" /> tren/bus
          </span>
        )}
      </div>
    </Link>
  );
}
