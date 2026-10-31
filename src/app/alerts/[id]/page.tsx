import { AlertTriangle, ArrowLeft, Bed, ChevronDown, ExternalLink, MapPin, Plane, Radar, Star, TrainFront } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "@/app/loading";
import { AlertActions } from "@/components/AlertActions";
import { GroundOptions, pickGround } from "@/components/GroundOptions";
import { formatDate } from "@/lib/dates";
import { ago, eur, minutes, monthLabel, STOPS_LABEL } from "@/lib/format";
import { getAlert, listMatches, markMatchesSeen } from "@/lib/repo";
import { currentUserId } from "@/lib/session";
import type { Match } from "@/lib/types";

const HOTEL_TYPE = {
  hotel: "Hotel",
  apartment: "Apartamento",
  hostel: "Hostal/albergue",
};

function shortLabel(label: string) {
  return label.split(",")[0];
}

function mapsDirections(from: string, to: string) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=transit`;
}

function MatchCard({ m, notifyMode, best }: { m: Match; notifyMode: "flight" | "flight_hotel"; best: boolean }) {
  const { flight, hotel, window, lastMile } = m.data;
  const pendingHotel = notifyMode === "flight_hotel" && m.kind === "flight";
  const destLabel = lastMile?.to.label ?? m.data.destinationLabel;
  // Puerta a puerta: + ida y vuelta en el transporte más barato desde el aeropuerto (el taxi se paga por vehículo).
  const pax = Math.max(1, Math.round((m.totalPrice - (hotel?.total ?? 0)) / flight.price));
  const { cheapest } = pickGround(lastMile?.options ?? []);
  const groundRoundTrip = cheapest ? cheapest.cost * 2 * (cheapest.kind === "taxi" ? 1 : pax) : 0;
  return (
    <article className={`card overflow-hidden p-0 ${m.seen ? "" : "ring-2 ring-accent/50"}`}>
      <header className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div>
          <div className="mb-1 flex flex-wrap gap-1.5">
            {!m.seen && <span className="badge bg-accent text-accent-ink">Nuevo</span>}
            {best && <span className="badge bg-good-soft text-good">Mejor precio</span>}
          </div>
          <p className="text-lg font-semibold">
            {formatDate(window.depart)} – {formatDate(window.ret)}
          </p>
          <p className="hint">
            {window.nights} {window.nights === 1 ? "noche" : "noches"}
            {window.workdaysUsed ? ` · gastas ${window.workdaysUsed} día(s) de vacaciones` : " · sin gastar vacaciones"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold text-accent tabular-nums">{eur(m.totalPrice)}</p>
          <p className="hint">{hotel ? "vuelo + alojamiento" : "solo vuelo"}</p>
          {groundRoundTrip > 0 && (
            <p className="mt-1 text-sm font-medium tabular-nums">
              ~{eur(m.totalPrice + groundRoundTrip)}
              <span className="hint block font-normal">con el trayecto ida y vuelta (+{eur(groundRoundTrip)})</span>
            </p>
          )}
        </div>
      </header>

      {pendingHotel && (
        <p className="mx-4 mb-3 flex items-start gap-2 rounded-2xl bg-warn-soft px-3 py-2 text-sm text-warn sm:mx-5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          El vuelo cumple, pero aún no hay alojamiento que encaje: no te hemos avisado.
        </p>
      )}

      <div className="divide-y divide-border border-t border-border">
        <section className="flex items-start gap-3 p-4 sm:px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-muted">
            <Plane className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              <span className="font-mono">{flight.origin}</span> → <span className="font-mono">{flight.destination}</span>
              {flight.airline ? ` · ${flight.airline}` : ""}
            </p>
            <p className="hint">
              {flight.stops === 0 ? "Directo" : `${flight.stops} escala(s)`}
              {flight.departTime ? ` · sale ${flight.departTime}` : ""}
              {flight.arriveTime ? ` · llega ${flight.arriveTime}` : ""}
              {flight.durationMinutes ? ` · ${minutes(flight.durationMinutes)}` : ""}
            </p>
            <p className="hint">
              {eur(flight.price)}/persona ida y vuelta · {flight.provider}
              {flight.cached ? " (precio en caché, compruébalo)" : ""}
            </p>
          </div>
          {flight.link && (
            <a href={flight.link} target="_blank" rel="noreferrer" className="btn-ghost min-h-10 shrink-0 px-3">
              Ver <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </section>

        <section className="space-y-3 p-4 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-muted">
              <MapPin className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Cómo llegar a {shortLabel(destLabel)}</p>
              <p className="hint">
                Desde el aeropuerto {flight.destination}
                {flight.arriveTime ? `, aterrizando a las ${flight.arriveTime}` : ""}. Precio de un trayecto (el taxi, por vehículo).
              </p>
            </div>
          </div>
          {lastMile?.options.length ? (
            <GroundOptions options={lastMile.options} />
          ) : (
            <p className="rounded-2xl bg-surface-2 px-3 py-2 text-sm text-muted">
              No hemos podido calcular el trayecto.{" "}
              <a
                className="font-medium text-accent"
                href={mapsDirections(`Aeropuerto ${flight.destination}`, destLabel)}
                target="_blank"
                rel="noreferrer"
              >
                Ver cómo ir en Google Maps
              </a>
            </p>
          )}
        </section>

        <section className="flex items-start gap-3 p-4 sm:px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-muted">
            <Bed className="h-5 w-5" />
          </span>
          {hotel ? (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{hotel.name}</p>
                <p className="hint flex flex-wrap items-center gap-x-1">
                  {HOTEL_TYPE[hotel.type]}
                  {hotel.stars ? ` · ${hotel.stars}★` : ""}
                  {hotel.rating ? (
                    <>
                      {" · "}
                      <Star className="h-3 w-3 fill-current text-warn" /> {hotel.rating}
                    </>
                  ) : null}
                </p>
                <p className="hint">
                  {eur(hotel.total)} en total ({eur(hotel.pricePerNight)}/noche) · {hotel.provider}
                </p>
              </div>
              {hotel.link && (
                <a href={hotel.link} target="_blank" rel="noreferrer" className="btn-ghost min-h-10 shrink-0 px-3">
                  Ver <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </>
          ) : (
            <p className="hint self-center">Sin alojamiento que cumpla (o la alerta no lo pide).</p>
          )}
        </section>
      </div>
    </article>
  );
}

async function AlertContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId();
  const alert = await getAlert(id, userId);
  if (!alert) notFound();
  const matches = await listMatches(id);
  const c = alert.config;
  const s = alert.lastSummary;
  const visible = matches.slice(0, 12);
  const bestPrice = matches.length ? Math.min(...matches.map((m) => m.totalPrice)) : null;
  const bestId = matches.find((m) => m.totalPrice === bestPrice)?.id;
  // Se marcan como vistos al abrir la alerta (se muestran resaltados solo esta vez).
  if (matches.some((m) => !m.seen)) await markMatchesSeen(id);

  const facts = [
    ["Aviso", c.notifyMode === "flight" ? "Con el vuelo" : "Vuelo + alojamiento"],
    ["Vuelo", `≤ ${eur(c.flight.maxPrice)} · ${STOPS_LABEL[c.flight.maxStops]} · ${c.flight.passengers} pers.`],
    ["Fechas", `${c.dates.months.map(monthLabel).join(", ")} · ${c.dates.minNights}-${c.dates.maxNights} noches`],
    [
      "Alojamiento",
      c.hotel
        ? `${c.hotel.types.map((t) => HOTEL_TYPE[t]).join(", ")}${c.hotel.maxPricePerNight ? ` ≤ ${eur(c.hotel.maxPricePerNight)}/noche` : ""}`
        : "No",
    ],
  ];

  return (
    <div className="space-y-5">
      <Link href="/" className="eyebrow inline-flex items-center gap-1 hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Alertas
      </Link>

      <section className="animate-rise rounded-3xl bg-gradient-to-br from-ink to-ink-2 p-5 text-white sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium text-white/70">
              <span className={`h-2 w-2 rounded-full ${alert.active ? "bg-good" : "bg-white/40"}`} />
              {alert.active ? `Buscando cada ${c.checkEveryHours} h` : "Pausada"} · {ago(alert.lastRunAt)}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance">{c.name}</h1>
            <p className="mt-1 text-sm text-white/75">
              <span className="font-mono">{c.origins.join(" · ")}</span> →{" "}
              {c.destination.kind === "place" ? c.destination.place.label.split(",").slice(0, 2).join(",") : "cualquier sitio"}
              {c.destinationAirports.length ? ` (${c.destinationAirports.join(", ")})` : ""}
            </p>
          </div>
          {bestPrice !== null && (
            <div className="shrink-0 text-right">
              <p className="text-xs text-white/65">desde</p>
              <p className="text-2xl font-semibold tabular-nums">{eur(bestPrice)}</p>
            </div>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-white/10 px-3 py-2">
              <dt className="text-xs text-white/60">{k}</dt>
              <dd className="font-medium first-letter:uppercase">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <AlertActions id={id} active={alert.active} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Resultados{" "}
          <span className="font-normal text-muted">
            {matches.length > visible.length ? `(${visible.length} de ${matches.length})` : `(${matches.length})`}
          </span>
        </h2>
        {visible.length ? (
          visible.map((m) => <MatchCard key={m.id} m={m} notifyMode={c.notifyMode} best={m.id === bestId} />)
        ) : (
          <div className="card flex flex-col items-center gap-2 py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
              <Radar className="h-6 w-6" />
            </span>
            <p className="font-medium">Todavía nada cumple tus condiciones</p>
            <p className="max-w-sm text-sm text-muted">Seguimos buscando y te avisaremos. Si tarda, prueba a subir el precio o añadir meses.</p>
          </div>
        )}
      </section>

      {s?.groundOnly && c.groundFrom && (
        <section className="card space-y-3">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-muted">
              <TrainFront className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">Sin avión desde {c.groundFrom.label.split(",")[0]}</h2>
              <p className="hint">Horarios reales (de un día equivalente si la fecha es lejana). FlixBus con precio real; el resto, estimado.</p>
            </div>
          </div>
          <GroundOptions options={s.groundOnlyOptions ?? [s.groundOnly]} />
        </section>
      )}

      {s && (
        <details className="card group" open={!matches.length && s.notes.length > 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span>
              <span className="block font-semibold">Cómo ha ido la última búsqueda</span>
              <span className="hint">
                {s.windows} fechas revisadas · {s.flightMatches} cumplen · {ago(s.at)}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" />
          </summary>
          {/* El embudo: de todas las fechas posibles a las ofertas que cumplen. */}
          <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["Fechas posibles", s.windows],
              ["Precios cribados", s.screened],
              ["Candidatos", s.candidates],
              ["Confirmados en vivo", s.confirmed],
              ["Cumplen", s.flightMatches],
            ].map(([label, n]) => (
              <li key={label} className="rounded-2xl bg-surface-2 p-3">
                <p className="text-xl font-semibold tabular-nums">{n}</p>
                <p className="hint">{label}</p>
              </li>
            ))}
          </ol>
          {s.notes.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
              {s.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </details>
      )}
    </div>
  );
}

export default function AlertPage({ params }: PageProps<"/alerts/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <AlertContent params={params} />
    </Suspense>
  );
}
