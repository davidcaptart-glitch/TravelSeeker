import { BusFront, CarTaxiFront, ChevronDown, ExternalLink, Footprints, Plane, Ship, TrainFront, TrainFrontTunnel, TramFront } from "lucide-react";
import { MODE_LABELS } from "@/lib/fares";
import { eur, minutes } from "@/lib/format";
import type { GroundOption, TransitLeg } from "@/lib/types";

const RAIL = ["RAIL", "SUBURBAN", "REGIONAL_RAIL", "REGIONAL_FAST_RAIL", "LONG_DISTANCE", "HIGHSPEED_RAIL", "NIGHT_RAIL"];

function modeIcon(mode: string) {
  if (mode === "BUS" || mode === "COACH") return BusFront;
  if (RAIL.includes(mode)) return TrainFront;
  if (mode === "SUBWAY" || mode === "METRO") return TrainFrontTunnel;
  if (mode === "TRAM") return TramFront;
  if (mode === "FERRY") return Ship;
  if (mode === "TAXI") return CarTaxiFront;
  if (mode === "FLIGHT") return Plane;
  return Footprints;
}

function legName(l: TransitLeg) {
  return `${MODE_LABELS[l.mode] ?? l.mode}${l.line ? ` ${l.line}` : ""}`;
}

/** Cadena de transportes de una opción: [bus 6] › [tren K8] › [taxi]. */
function ModeChain({ legs }: { legs: TransitLeg[] }) {
  const ride = legs.filter((l) => l.mode !== "WALK");
  return (
    <ol className="flex flex-wrap items-center gap-1">
      {ride.map((l, i) => {
        const Icon = modeIcon(l.mode);
        return (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted">›</span>}
            <span className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-1.5 py-0.5 text-xs font-medium">
              <Icon className="h-3.5 w-3.5" />
              {legName(l)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Cheapest y fastest para etiquetar las opciones cuando hay más de una. */
export function pickGround(options: GroundOption[]) {
  if (!options.length) return { cheapest: undefined, fastest: undefined };
  const cheapest = options.reduce((a, b) => (b.cost < a.cost ? b : a));
  const fastest = options.reduce((a, b) => (b.minutes < a.minutes ? b : a));
  return { cheapest, fastest };
}

export function GroundOptions({ options }: { options: GroundOption[] }) {
  if (!options.length) return <p className="hint">No se ha encontrado ruta.</p>;
  const { cheapest, fastest } = pickGround(options);
  const sorted = [...options].sort((a, b) => a.cost - b.cost);
  return (
    <ul className="space-y-2">
      {sorted.map((o, i) => {
        const real = o.legs.some((l) => l.realPrice);
        const tags = options.length > 1 ? [o === cheapest && "Más barato", o === fastest && "Más rápido"].filter(Boolean) : [];
        const first = o.legs.find((l) => l.mode !== "WALK" && l.departTime);
        const links = [
          ...(o.mapsLink ? [{ label: "Ver en mapa", url: o.mapsLink }] : []),
          ...(o.bookingLinks ?? [])
            .filter((b) => b.label !== "Google Maps")
            .map((b) => ({ label: b.label === "FlixBus" && real ? "Reservar en FlixBus" : `Precio en ${b.label}`, url: b.url })),
        ];
        return (
          <li key={i} className="rounded-2xl border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                {tags.length > 0 && (
                  <div className="flex gap-1">
                    {tags.map((t) => (
                      <span key={String(t)} className="badge bg-accent-soft text-accent">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <ModeChain legs={o.legs} />
                <p className="hint">
                  {minutes(o.minutes)}
                  {o.kind !== "taxi" && o.legs.filter((l) => l.mode !== "WALK").length > 1
                    ? ` · ${o.legs.filter((l) => l.mode !== "WALK").length - 1} transbordo(s)`
                    : ""}
                  {first?.departTime ? ` · primera salida ${first.departTime}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold tabular-nums" title={o.estimated ? "Estimación aproximada" : "Precio real para la fecha del viaje"}>
                  {o.estimated ? "~" : ""}
                  {eur(o.cost)}
                </p>
                {real && <span className="badge bg-good-soft text-good">{o.estimated ? "en parte real" : "precio real"}</span>}
              </div>
            </div>
            {o.legs.length > 1 && (
              <details className="group mt-2">
                <summary className="hint flex cursor-pointer list-none items-center gap-1 font-medium">
                  Paso a paso <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
                </summary>
                <ol className="mt-2 space-y-2 border-l-2 border-border pl-3 text-xs">
                  {o.legs.map((l, j) => {
                    const Icon = modeIcon(l.mode);
                    return (
                      <li key={j} className="flex justify-between gap-2">
                        <span className="flex gap-1.5">
                          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                          <span>
                            <b>{legName(l)}</b>
                            {l.agency ? ` (${l.agency})` : ""}: {l.from} → {l.to}
                          </span>
                        </span>
                        <span className="shrink-0 text-muted tabular-nums">
                          {l.departTime ? `${l.departTime} · ` : ""}
                          {minutes(l.minutes)}
                          {l.cost ? ` · ${l.realPrice ? "" : "~"}${eur(l.cost)}` : ""}
                        </span>
                      </li>
                    );
                  })}
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
