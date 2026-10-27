import { MODE_LABELS } from "@/lib/fares";
import { eur, minutes } from "@/lib/format";
import type { GroundOption } from "@/lib/types";

const ICON: Record<GroundOption["kind"], string> = { transit: "🚆", mixed: "🔀", taxi: "🚕" };

export function GroundOptions({ options }: { options: GroundOption[] }) {
  if (!options.length) return <p className="hint">No se ha encontrado ruta.</p>;
  return (
    <ul className="space-y-2">
      {options.map((o, i) => (
        <li key={i} className="rounded-xl border border-border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {ICON[o.kind]} {o.label}
              </p>
              <p className="hint">
                {minutes(o.minutes)}
                {o.kind === "transit" ? ` · ${o.legs.filter((l) => l.mode !== "WALK").length - 1} transbordos` : ""}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold" title="Estimación aproximada">
              ~{eur(o.cost)}
            </span>
          </div>
          {o.legs.length > 1 && (
            <details className="mt-2">
              <summary className="hint cursor-pointer">Ver tramos</summary>
              <ol className="mt-2 space-y-1 text-xs">
                {o.legs.map((l, j) => (
                  <li key={j} className="flex justify-between gap-2">
                    <span>
                      <b>{MODE_LABELS[l.mode] ?? l.mode}</b>
                      {l.line ? ` ${l.line}` : ""} {l.agency ? `(${l.agency})` : ""}: {l.from} → {l.to}
                    </span>
                    <span className="shrink-0 text-muted">
                      {minutes(l.minutes)}
                      {l.cost ? ` · ${eur(l.cost)}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {o.mapsLink && (
              <a className="text-accent underline" href={o.mapsLink} target="_blank" rel="noreferrer">
                Ver en mapa
              </a>
            )}
            {o.bookingLinks
              ?.filter((b) => b.label !== "Google Maps")
              .map((b) => (
                <a key={b.label} className="text-accent underline" href={b.url} target="_blank" rel="noreferrer">
                  Precio real en {b.label}
                </a>
              ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
