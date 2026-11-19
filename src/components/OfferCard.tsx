import { Bed, ChevronRight, PartyPopper, Plane, TrendingDown } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { ago, eur } from "@/lib/format";
import type { MatchWithAlert } from "@/lib/repo";
import { MatchActions } from "./MatchActions";

/** Tarjeta compacta de una oferta para las listas (Ofertas y Guardados): lo justo para decidir de un vistazo. */
export function OfferCard({ m, index = 0 }: { m: MatchWithAlert; index?: number }) {
  const { flight, hotel, window } = m.data;
  const dest = m.data.destinationLabel.split(",")[0];
  const cheaper = m.updatedAt !== m.createdAt && !m.seen;
  const booked = m.status === "booked";
  return (
    <article
      id={`m-${m.id}`}
      className={`${!m.seen || booked ? "card-glow" : "card"} animate-rise min-w-0 space-y-4 p-4`}
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
    >
      <Link href={`/alerts/${m.alertId}#m-${m.id}`} className="group block">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted">
              <span className="truncate">{m.alertName}</span>
              {booked && (
                <span className="badge bg-good-soft text-good">
                  <PartyPopper className="h-3 w-3" /> Reservado
                </span>
              )}
              {!booked && !m.seen && (cheaper ? (
                <span className="badge bg-good-soft text-good">
                  <TrendingDown className="h-3 w-3" /> Ha bajado
                </span>
              ) : (
                <span className="badge bg-gradient-brand text-white">Nuevo</span>
              ))}
            </p>
            <h3 className="mt-1 truncate text-lg font-bold">{dest}</h3>
            <p className="text-sm text-muted">
              {formatDate(window.depart)} – {formatDate(window.ret)} · {window.nights} {window.nights === 1 ? "noche" : "noches"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-gradient text-2xl font-extrabold tabular-nums">{eur(m.totalPrice)}</p>
            <p className="hint">{hotel ? "vuelo + alojamiento" : "vuelo i/v"}</p>
          </div>
        </div>
        <div className="mt-3 flex min-w-0 items-center gap-2 text-xs text-muted">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 font-mono font-semibold text-foreground">
            <Plane className="h-3 w-3" /> {flight.origin}→{flight.via?.length ? `${flight.via.join("/")}→` : ""}{flight.destination}
          </span>
          {flight.via?.length ? (
            <span className="badge shrink-0 bg-accent-soft text-cyan">Combinado</span>
          ) : null}
          <span className={flight.via?.length ? "hidden" : "shrink-0"}>{flight.stops === 0 ? "Directo" : `${flight.stops} escala${flight.stops > 1 ? "s" : ""}`}</span>
          {hotel && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Bed className="h-3 w-3 shrink-0" /> <span className="truncate">{hotel.name}</span>
            </span>
          )}
          <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 font-semibold text-foreground transition group-hover:translate-x-0.5">
            Detalles <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </Link>
      <MatchActions id={m.id} status={m.status} link={flight.legs ? undefined : flight.link} />
      <p className="hint -mt-2 text-right">Precio comprobado {ago(m.updatedAt)}</p>
    </article>
  );
}

/** Indicador de que la búsqueda sigue en marcha. */
export function StillSearching({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2.5 text-sm text-muted">
      <span className="radar relative inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-cyan text-cyan" />
      {text}
    </p>
  );
}
