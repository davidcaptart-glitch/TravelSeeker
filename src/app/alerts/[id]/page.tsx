import { Suspense } from "react";
import Loading from "@/app/loading";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertActions } from "@/components/AlertActions";
import { GroundOptions } from "@/components/GroundOptions";
import { formatDate } from "@/lib/dates";
import { ago, eur, minutes, monthLabel, STOPS_LABEL } from "@/lib/format";
import { getAlert, listMatches, markMatchesSeen } from "@/lib/repo";
import { currentUserId } from "@/lib/session";
import type { Match } from "@/lib/types";

const HOTEL_TYPE = { hotel: "Hotel", apartment: "Apartamento", hostel: "Hostal/albergue" };

function MatchCard({ m, notifyMode }: { m: Match; notifyMode: "flight" | "flight_hotel" }) {
  const { flight, hotel, window, lastMile } = m.data;
  const pendingHotel = notifyMode === "flight_hotel" && m.kind === "flight";
  // Puerta a puerta: + ida y vuelta en el transporte más barato desde el aeropuerto.
  const cheapestGround = Math.min(...(lastMile?.options.map((o) => o.cost) ?? [0]));
  const pax = Math.max(1, Math.round((m.totalPrice - (hotel?.total ?? 0)) / flight.price));
  const doorToDoor = m.totalPrice + (Number.isFinite(cheapestGround) ? cheapestGround * 2 * pax : 0);
  return (
    <article className={`card space-y-4 ${m.seen ? "" : "ring-2 ring-accent/40"}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">
            {formatDate(window.depart)} – {formatDate(window.ret)}
          </p>
          <p className="hint">
            {window.nights} {window.nights === 1 ? "noche" : "noches"}
            {window.workdaysUsed ? ` · gastas ${window.workdaysUsed} día(s) de vacaciones` : " · sin gastar vacaciones"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold">{eur(m.totalPrice)}</p>
          <p className="hint">{hotel ? "vuelo + alojamiento" : "solo vuelo"}</p>
          {doorToDoor > m.totalPrice && <p className="hint">~{eur(doorToDoor)} puerta a puerta</p>}
        </div>
      </header>

      {pendingHotel && (
        <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          El vuelo cumple, pero todavía no hay alojamiento que encaje: no se ha avisado.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl bg-surface-2 p-4">
          <h3 className="mb-1 text-sm font-semibold">✈️ Vuelo</h3>
          <p className="text-sm">
            {flight.origin} → {flight.destination} · <b>{eur(flight.price)}</b>/persona ida y vuelta
          </p>
          <p className="hint">
            {flight.stops === 0 ? "Directo" : `${flight.stops} escala(s)`}
            {flight.airline ? ` · ${flight.airline}` : ""}
            {flight.departTime ? ` · sale ${flight.departTime}` : ""}
            {flight.arriveTime ? ` · llega ${flight.arriveTime}` : ""}
            {flight.durationMinutes ? ` · ${minutes(flight.durationMinutes)}` : ""}
          </p>
          <p className="hint mt-1">
            Fuente: {flight.provider}
            {flight.cached ? " (precio en caché, compruébalo)" : ""}
          </p>
          {flight.link && (
            <a href={flight.link} target="_blank" rel="noreferrer" className="btn-ghost mt-3 py-1.5">
              Ver vuelo
            </a>
          )}
        </section>

        <section className="rounded-xl bg-surface-2 p-4">
          <h3 className="mb-1 text-sm font-semibold">🏨 Alojamiento</h3>
          {hotel ? (
            <>
              <p className="text-sm">
                {hotel.name} · <b>{eur(hotel.total)}</b> total ({eur(hotel.pricePerNight)}/noche)
              </p>
              <p className="hint">
                {HOTEL_TYPE[hotel.type]}
                {hotel.stars ? ` · ${hotel.stars}★` : ""}
                {hotel.rating ? ` · nota ${hotel.rating}` : ""} · {hotel.provider}
              </p>
              {hotel.link && (
                <a href={hotel.link} target="_blank" rel="noreferrer" className="btn-ghost mt-3 py-1.5">
                  Ver alojamiento
                </a>
              )}
            </>
          ) : (
            <p className="hint">Sin alojamiento que cumpla (o la alerta no lo pide).</p>
          )}
        </section>
      </div>

      {lastMile && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">
            🚏 {lastMile.from.label} → {lastMile.to.label}
          </h3>
          <GroundOptions options={lastMile.options} />
        </section>
      )}
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
  // Se marcan como vistos al abrir la alerta (se muestran resaltados solo esta vez).
  if (matches.some((m) => !m.seen)) await markMatchesSeen(id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="hint hover:underline">
          ← Alertas
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{c.name}</h1>
        <p className="text-sm text-muted">
          {c.origins.join(" / ")} →{" "}
          {c.destination.kind === "place" ? c.destination.place.label : "cualquier sitio"}
          {c.destinationAirports.length ? ` (${c.destinationAirports.join(", ")})` : ""}
        </p>
      </div>

      <AlertActions id={id} active={alert.active} />

      <section className="card grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="hint">Aviso</p>
          <p>{c.notifyMode === "flight" ? "Cuando el vuelo cumpla" : "Cuando vuelo y alojamiento cumplan"}</p>
        </div>
        <div>
          <p className="hint">Vuelo</p>
          <p>
            ≤ {eur(c.flight.maxPrice)}/pers · {STOPS_LABEL[c.flight.maxStops]} · {c.flight.passengers} pers.
          </p>
        </div>
        <div>
          <p className="hint">Fechas</p>
          <p>
            {c.dates.months.map(monthLabel).join(", ")} · {c.dates.weekendsOnly ? "findes y puentes" : "cualquier día"} ·{" "}
            {c.dates.minNights}-{c.dates.maxNights} noches
          </p>
        </div>
        <div>
          <p className="hint">Alojamiento</p>
          <p>
            {c.hotel
              ? `${c.hotel.types.map((t) => HOTEL_TYPE[t]).join(", ")}${c.hotel.maxPricePerNight ? ` ≤ ${eur(c.hotel.maxPricePerNight)}/noche` : ""}`
              : "No"}
          </p>
        </div>
      </section>

      {s && (
        <section className="card text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Última búsqueda · {ago(s.at)}</h2>
            <p className="hint">Se repite cada {c.checkEveryHours} h</p>
          </div>
          {/* El embudo: de todas las fechas posibles a las ofertas que cumplen. */}
          <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["Fechas posibles", s.windows],
              ["Precios cribados", s.screened],
              ["Candidatos", s.candidates],
              ["Confirmados en vivo", s.confirmed],
              ["Cumplen", s.flightMatches],
            ].map(([label, n]) => (
              <li key={label} className="rounded-xl bg-surface-2 p-3">
                <p className="text-xl font-semibold">{n}</p>
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
        </section>
      )}

      {s?.groundOnly && c.groundFrom && (
        <section className="card">
          <h2 className="mb-1 font-semibold">🚆 Alternativa sin avión desde {c.groundFrom.label}</h2>
          <p className="hint mb-3">Horario real de un día equivalente; el precio es una estimación.</p>
          <GroundOptions options={[s.groundOnly]} />
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-semibold">
          Resultados {matches.length > visible.length ? `(${visible.length} de ${matches.length})` : `(${matches.length})`}
        </h2>
        {visible.length ? (
          visible.map((m) => <MatchCard key={m.id} m={m} notifyMode={c.notifyMode} />)
        ) : (
          <p className="card text-sm text-muted">
            Todavía nada cumple tus condiciones. Seguimos buscando y te avisaremos.
          </p>
        )}
      </section>
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
