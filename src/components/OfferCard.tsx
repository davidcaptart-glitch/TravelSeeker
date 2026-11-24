import { Bed, BusFront, ChevronRight, PartyPopper, Plane, TrainFront, TrendingDown } from "lucide-react";
import Link from "next/link";
import { getFormat, getT } from "@/i18n/server";
import type { MatchWithAlert } from "@/lib/repo";
import { MatchActions } from "./MatchActions";

/** Tarjeta compacta de una oferta para las listas (Ofertas y Guardados): lo justo para decidir de un vistazo. */
export async function OfferCard({ m, index = 0 }: { m: MatchWithAlert; index?: number }) {
  const [t, f] = await Promise.all([getT("offers"), getFormat()]);
  const { flight, hotel, window, ground } = m.data;
  const kindLabel = ground ? t(`ground_${ground.mode}`) : !flight ? t("hotelOnly") : hotel ? t("flightHotel") : t("flightReturn");
  const GroundIcon = ground?.mode === "bus" ? BusFront : TrainFront;
  const bookLink = flight ? (flight.legs ? undefined : flight.link) : ground ? (ground.out.legs.find((l) => l.ticketUrl)?.ticketUrl ?? ground.out.bookingLinks?.[0]?.url) : (hotel?.bookingLinks?.[0]?.url ?? hotel?.link);
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
                  <PartyPopper className="h-3 w-3" /> {t("booked")}
                </span>
              )}
              {!booked && !m.seen && (cheaper ? (
                <span className="badge bg-good-soft text-good">
                  <TrendingDown className="h-3 w-3" /> {t("priceDropped")}
                </span>
              ) : (
                <span className="badge bg-gradient-brand text-white">{t("new")}</span>
              ))}
            </p>
            <h3 className="mt-1 truncate text-lg font-bold">{dest}</h3>
            <p className="text-sm text-muted">
              {window.nights === 0
                ? `${f.date(window.depart)} · ${f.nights(0)}`
                : `${f.date(window.depart)} – ${f.date(window.ret)} · ${f.nights(window.nights)}`}
            </p>
          </div>
          <div className="shrink-0 text-end">
            <p className="text-gradient text-2xl font-extrabold tabular-nums">{f.eur(m.totalPrice)}</p>
            <p className="hint">{kindLabel}</p>
          </div>
        </div>
        <div className="mt-3 flex min-w-0 items-center gap-2 text-xs text-muted">
          {flight && (
            <>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 font-mono font-semibold text-foreground">
                <Plane className="h-3 w-3" /> {flight.origin}→{flight.via?.length ? `${flight.via.join("/")}→` : ""}{flight.destination}
              </span>
              {flight.via?.length ? <span className="badge shrink-0 bg-accent-soft text-cyan">{t("combined")}</span> : null}
              <span className={flight.via?.length ? "hidden" : "shrink-0"}>{t("stops", { n: flight.stops })}</span>
            </>
          )}
          {ground && (
            <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 font-semibold text-foreground">
              <GroundIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {ground.out.legs.filter((l) => l.mode !== "WALK").map((l) => l.line ?? l.agency ?? l.mode).slice(0, 2).join(" › ")}
              </span>
            </span>
          )}
          {hotel && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Bed className="h-3 w-3 shrink-0" /> <span className="truncate">{hotel.name}</span>
            </span>
          )}
          <span className="ms-auto inline-flex shrink-0 items-center gap-0.5 font-semibold text-foreground transition group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5">
            {t("details")} <ChevronRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
          </span>
        </div>
      </Link>
      <MatchActions id={m.id} status={m.status} link={bookLink} />
      <p className="hint -mt-2 text-end">{t("priceChecked", { ago: f.ago(m.updatedAt) })}</p>
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
