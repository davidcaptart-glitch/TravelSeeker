import { Bus, Car, ChevronDown, ExternalLink, Shuffle, TrainFront } from "lucide-react";
import { MODE_LABELS } from "@/lib/fares";
import { eur, minutes } from "@/lib/format";
import type { GroundOption } from "@/lib/types";

const ICON: Record<GroundOption["kind"], typeof Bus> = { transit: TrainFront, mixed: Shuffle, taxi: Car };

export function GroundOptions({ options }: { options: GroundOption[] }) {
  if (!options.length) return <p className="hint">No se ha encontrado ruta.</p>;
  return (
    <ul className="space-y-2">
      {options.map((o, i) => {
        const Icon = o.legs.some((l) => l.realPrice) ? Bus : ICON[o.kind];
        const real = o.legs.some((l) => l.realPrice);
        const links = [
          ...(o.mapsLink ? [{ label: "Ver en mapa", url: o.mapsLink }] : []),
          ...(o.bookingLinks ?? [])
            .filter((b) => b.label !== "Google Maps")
            .map((b) => ({ label: b.label === "FlixBus" && real ? "Reservar en FlixBus" : `Precio en ${b.label}`, url: b.url })),
        ];
        return (
          <li key={i} className="rounded-2xl border border-border p-3">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{o.label}</p>
                <p className="hint">
                  {minutes(o.minutes)}
                  {o.kind === "transit" ? ` · ${Math.max(0, o.legs.filter((l) => l.mode !== "WALK").length - 1)} transbordos` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums" title={o.estimated ? "Estimación aproximada" : "Precio real para la fecha del viaje"}>
                  {o.estimated ? "~" : ""}
                  {eur(o.cost)}
                </p>
                {real && <span className="badge bg-good-soft text-good">{o.estimated ? "en parte real" : "precio real"}</span>}
              </div>
            </div>
            {o.legs.length > 1 && (
              <details className="group mt-2">
                <summary className="hint flex cursor-pointer list-none items-center gap-1">
                  Ver tramos <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
                </summary>
                <ol className="mt-2 space-y-1.5 border-l-2 border-border pl-3 text-xs">
                  {o.legs.map((l, j) => (
                    <li key={j} className="flex justify-between gap-2">
                      <span>
                        <b>{MODE_LABELS[l.mode] ?? l.mode}</b>
                        {l.line ? ` ${l.line}` : ""} {l.agency ? `(${l.agency})` : ""}: {l.from} → {l.to}
                      </span>
                      <span className="shrink-0 text-muted tabular-nums">
                        {l.departTime ? `${l.departTime} · ` : ""}
                        {minutes(l.minutes)}
                        {l.cost ? ` · ${l.realPrice ? "" : "~"}${eur(l.cost)}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {links.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {links.map((b) => (
                  <a key={b.label} className="inline-flex items-center gap-1 font-medium text-accent" href={b.url} target="_blank" rel="noreferrer">
                    {b.label} <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
