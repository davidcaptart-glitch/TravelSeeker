import { CalendarLinks } from "@/components/CalendarLinks";
import { AlertTriangle, ArrowLeft, Bed, BusFront, ChevronDown, ExternalLink, MapPin, PartyPopper, Plane, Radar, Scale, Star, TrainFront } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "@/app/[lang]/loading";
import { AlertActions } from "@/components/AlertActions";
import { GroundOptions, pickGround } from "@/components/GroundOptions";
import { ComboLegs, airlineName } from "@/components/ComboLegs";
import { MatchActions } from "@/components/MatchActions";
import { StillSearching } from "@/components/OfferCard";
import { PriceInsights } from "@/components/PriceInsights";
import type { Translator } from "@/i18n/core";
import type { Format } from "@/i18n/format";
import type { NsMessages } from "@/i18n/messages";
import { getFormat, getT } from "@/i18n/server";
import { getAirport } from "@/lib/geo";
import { getAlert, listMatches, markMatchesSeen, priceHistory } from "@/lib/repo";
import { currentUserId } from "@/lib/session";
import type { CompareRow, GroundTrip, HotelOffer, Match } from "@/lib/types";

type I18n = { t: Translator<NsMessages<"alertDetail">>; tt: Translator<NsMessages<"transport">>; f: Format };

function shortLabel(label: string) {
  return label.split(",")[0];
}

function mapsDirections(from: string, to: string) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=transit`;
}

/**
 * Reservar el alojamiento: botón principal en la web más barata (con fechas y personas ya puestas),
 * el resto de webs con su precio por noche y el enlace a las opiniones.
 */
function HotelBooking({ hotel, t, f }: { hotel: HotelOffer } & Pick<I18n, "t" | "f">) {
  const siteName = (b: { label: string; official?: boolean }) => (b.official || b.label === "official" ? t("officialSite") : b.label);
  const links = hotel.bookingLinks ?? [];
  const [first, ...others] = links;
  // Coincidencias antiguas: solo tienen link (sin la lista de webs).
  const primary = first
    ? { url: first.url, label: t("bookOnSite", { site: siteName(first), price: f.eur(first.pricePerNight ?? hotel.pricePerNight) }) }
    : hotel.link
      ? { url: hotel.link, label: t("bookHotel", { price: f.eur(hotel.pricePerNight) }) }
      : null;
  if (!primary && !hotel.reviewsLink) return null;
  return (
    <div className="mt-3 space-y-2">
      {primary && (
        <a href={primary.url} target="_blank" rel="noreferrer" className="btn-primary min-h-10 w-full px-4 text-sm sm:w-auto">
          {primary.label} <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </a>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {others.map((b, i) => (
            <a
              key={`${b.label}-${i}`}
              href={b.url}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost min-h-9 px-3 text-xs tabular-nums"
            >
              {siteName(b)}
              {b.pricePerNight !== undefined ? ` ${f.eur(b.pricePerNight)}` : ""}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ))}
        </div>
      )}
      {primary && <p className="hint">{t("bookingHint")}</p>}
      {hotel.reviewsLink && (
        <a href={hotel.reviewsLink} target="_blank" rel="noreferrer" className="hint inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
          <Star className="h-3 w-3" /> {t("viewReviews")}
        </a>
      )}
    </div>
  );
}

const COMPARE_ICON = { flight: Plane, train: TrainFront, bus: BusFront };

/** Comparar avión, tren y autobús: lo más barato de cada uno en tus fechas (por persona, ida y vuelta). */
function CompareCard({ rows, t, f }: { rows: CompareRow[] } & Pick<I18n, "t" | "f">) {
  return (
    <section className="card space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Scale className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold">{t("compareTitle")}</h2>
          <p className="hint">{t("compareLead")}</p>
        </div>
      </div>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const Icon = COMPARE_ICON[r.mode];
            const row = (
              <>
                <Icon className="h-5 w-5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                    {t(`compare_${r.mode}`)}
                    {i === 0 && rows.length > 1 && <span className="badge bg-good-soft text-good">{t("compareCheapest")}</span>}
                  </p>
                  <p className="hint truncate">
                    {r.depart === r.ret ? f.date(r.depart) : `${f.date(r.depart)} – ${f.date(r.ret)}`}
                    {r.minutes ? ` · ${f.minutes(r.minutes)}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-end font-bold tabular-nums">
                  {r.estimated ? "~" : ""}
                  {f.eur(r.price)}
                </p>
              </>
            );
            return (
              <li key={r.mode}>
                {r.matchId ? (
                  <a href={`#m-${r.matchId}`} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 transition hover:bg-surface-3">
                    {row}
                  </a>
                ) : (
                  <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl bg-surface-2 px-3 py-2.5 text-sm text-muted">{t("compareNone")}</p>
      )}
      <p className="hint">{t("compareNote")}</p>
    </section>
  );
}

/** Viaje en tren o autobús: la ida y la vuelta, con sus líneas, horarios y enlaces de compra. */
function GroundTripSection({ g, t, tt, f }: { g: GroundTrip } & I18n) {
  const parts = [
    { label: t("outbound"), opt: g.out },
    ...(g.back ? [{ label: t("inbound"), opt: g.back }] : []),
  ];
  return (
    <section className="space-y-3 p-4 sm:px-5">
      {parts.map((p) => (
        <div key={p.label} className="space-y-2">
          <p className="eyebrow">{p.label}</p>
          <GroundOptions options={[p.opt]} pax={1} plain t={tt} f={f} />
        </div>
      ))}
      {!g.back && <p className="hint">{t("noReturnFound")}</p>}
    </section>
  );
}

function MatchCard({ m, notifyMode, best, t, tt, f }: { m: Match; notifyMode: "flight" | "flight_hotel"; best: boolean } & I18n) {
  const { flight, hotel, window, lastMile, ground } = m.data;
  const pendingHotel = notifyMode === "flight_hotel" && m.kind === "flight";
  const destLabel = lastMile?.to.label ?? m.data.destinationLabel;
  // Puerta a puerta: + ida y vuelta en el transporte más barato desde el aeropuerto (el taxi se paga por vehículo).
  const pax = flight ? Math.max(1, Math.round((m.totalPrice - (hotel?.total ?? 0)) / flight.price)) : 1;
  const subtitle = ground ? t(`groundTrip_${ground.mode}`) : !flight ? t("hotelOnly") : hotel ? t("flightHotel") : t("flightOnly");
  const bookLink = flight ? (flight.legs ? undefined : flight.link) : ground ? (ground.out.legs.find((l) => l.ticketUrl)?.ticketUrl ?? ground.out.bookingLinks?.[0]?.url) : hotel?.bookingLinks?.[0]?.url ?? hotel?.link;
  const { cheapest } = pickGround(lastMile?.options ?? []);
  const groundRoundTrip = cheapest ? cheapest.cost * 2 * (cheapest.kind === "taxi" ? 1 : pax) : 0;
  return (
    <article id={`m-${m.id}`} className={`${m.seen && m.status !== "booked" ? "card" : "card-glow"} scroll-mt-24 overflow-hidden p-0`}>
      <header className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div>
          <div className="mb-1 flex flex-wrap gap-1.5">
            {m.status === "booked" && (
              <span className="badge bg-good-soft text-good">
                <PartyPopper className="h-3 w-3" /> {t("badgeBooked")}
              </span>
            )}
            {m.status === "saved" && <span className="badge bg-accent-soft text-accent">{t("badgeSaved")}</span>}
            {!m.seen && m.status === "new" && <span className="badge bg-gradient-brand text-white">{t("badgeNew")}</span>}
            {best && <span className="badge bg-good-soft text-good">{t("badgeBest")}</span>}
          </div>
          <p className="text-lg font-semibold">
            {window.nights === 0 ? f.date(window.depart) : `${f.date(window.depart)} – ${f.date(window.ret)}`}
          </p>
          <p className="hint">
            {f.nights(window.nights)}
            {` · ${window.workdaysUsed ? t("workdaysUsed", { n: window.workdaysUsed }) : t("noWorkdays")}`}
          </p>
        </div>
        <div className="shrink-0 text-end">
          <p className="text-gradient text-2xl font-extrabold tabular-nums">{f.eur(m.totalPrice)}</p>
          <p className="hint">{subtitle}</p>
          {groundRoundTrip > 0 && (
            <p className="mt-1 text-sm font-medium tabular-nums">
              ~{f.eur(m.totalPrice + groundRoundTrip)}
              <span className="hint block font-normal">{t("withTransfers", { price: f.eur(groundRoundTrip) })}</span>
            </p>
          )}
        </div>
      </header>

      {m.status === "booked" && <CalendarLinks m={m} />}

      {pendingHotel && (
        <p className="mx-4 mb-3 flex items-start gap-2 rounded-2xl bg-warn-soft px-3 py-2 text-sm text-warn sm:mx-5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t("pendingHotel")}
        </p>
      )}

      <div className="divide-y divide-border border-t border-border">
        {ground && <GroundTripSection g={ground} t={t} tt={tt} f={f} />}
        {!flight ? null : flight.legs ? (
          <ComboLegs flight={flight} />
        ) : (
        <section className="flex items-start gap-3 p-4 sm:px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-muted">
            <Plane className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              <span className="font-mono">{flight.origin}</span> <span className="inline-block rtl:-scale-x-100">→</span>{" "}
              <span className="font-mono">{flight.destination}</span>
              {flight.airline ? ` · ${airlineName(flight.airline)}` : ""}
            </p>
            <p className="hint">
              {t("stopsCount", { n: flight.stops })}
              {flight.departTime ? ` · ${t("departs", { time: flight.departTime })}` : ""}
              {flight.arriveTime ? ` · ${t("arrives", { time: flight.arriveTime })}` : ""}
              {flight.durationMinutes ? ` · ${f.minutes(flight.durationMinutes)}` : ""}
            </p>
            <p className="hint">
              {t("pricePerPersonReturn", { price: f.eur(flight.price) })} · {flight.provider}
              {flight.cached ? ` ${t("cachedPrice")}` : ""}
            </p>
          </div>
          {flight.link && (
            <a href={flight.link} target="_blank" rel="noreferrer" className="btn-ghost min-h-10 shrink-0 px-3">
              {t("view")} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </section>
        )}

        {flight && (
        <section className="space-y-3 p-4 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-muted">
              <MapPin className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t("getTo", { place: shortLabel(destLabel) })}</p>
              <p className="hint">
                {flight.arriveTime
                  ? t("fromAirportLanding", { code: flight.destination, time: flight.arriveTime })
                  : t("fromAirport", { code: flight.destination })}{" "}
                {t("groundLead")}
              </p>
            </div>
          </div>
          {lastMile?.options.length ? (
            <GroundOptions
              options={lastMile.options}
              from={lastMile.from}
              to={lastMile.to}
              country={getAirport(flight.destination)?.country}
              pax={pax}
              t={tt}
              f={f}
            />
          ) : (
            <p className="rounded-2xl bg-surface-2 px-3 py-2 text-sm text-muted">
              {t("noRoute")}{" "}
              <a
                className="font-medium text-accent"
                href={mapsDirections(tt("airport", { code: flight.destination }), destLabel)}
                target="_blank"
                rel="noreferrer"
              >
                {t("viewInMaps")}
              </a>
            </p>
          )}
        </section>
        )}

        {(flight || hotel) && (
        <section className="flex items-start gap-3 p-4 sm:px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-muted">
            <Bed className="h-5 w-5" />
          </span>
          {hotel ? (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{hotel.name}</p>
                <p className="hint flex flex-wrap items-center gap-x-1">
                  {t(`hotelType_${hotel.type}`)}
                  {hotel.stars ? ` · ${hotel.stars}★` : ""}
                  {hotel.rating ? (
                    <>
                      {" · "}
                      <Star className="h-3 w-3 fill-current text-warn" /> {hotel.rating}
                    </>
                  ) : null}
                </p>
                <p className="hint">
                  {t("hotelTotal", { total: f.eur(hotel.total), night: f.eur(hotel.pricePerNight) })} · {hotel.provider}
                </p>
                {hotel.usualMin && hotel.usualMax ? (
                  <p className="hint mt-1 flex flex-wrap items-center gap-1.5">
                    {t("hotelUsual", { min: f.eur(hotel.usualMin), max: f.eur(hotel.usualMax) })}
                    {hotel.pricePerNight <= hotel.usualMin * 1.1 && <span className="badge bg-good-soft text-good">{t("goodPrice")}</span>}
                  </p>
                ) : null}
                <HotelBooking hotel={hotel} t={t} f={f} />
              </div>
            </>
          ) : (
            <p className="hint self-center">{t("noHotel")}</p>
          )}
        </section>
        )}
      </div>
      <footer className="border-t border-border bg-surface-2/40 p-4 sm:px-5">
        {/* En un combinado se reserva tramo a tramo (arriba); aquí solo se marca. */}
        <MatchActions id={m.id} status={m.status} link={bookLink} />
      </footer>
    </article>
  );
}

async function AlertContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId();
  const alert = await getAlert(id, userId);
  if (!alert) notFound();
  const [matches, history, t, tt, f] = await Promise.all([listMatches(id), priceHistory(id), getT("alertDetail"), getT("transport"), getFormat()]);
  const c = alert.config;
  const s = alert.lastSummary;
  const booked = matches.filter((m) => m.status === "booked");
  const pendingList = matches.filter((m) => m.status === "new");
  const savedList = matches.filter((m) => m.status === "saved");
  const dismissed = matches.filter((m) => m.status === "dismissed");
  const open = [...pendingList, ...savedList];
  const bestPrice = open.length ? Math.min(...open.map((m) => m.totalPrice)) : null;
  const bestId = open.find((m) => m.totalPrice === bestPrice)?.id;
  const list = (ms: Match[]) =>
    ms.map((m, i) => (
      <div key={m.id} className="animate-rise" style={{ animationDelay: `${100 + Math.min(i, 6) * 60}ms` }}>
        <MatchCard m={m} notifyMode={c.notifyMode} best={m.id === bestId} t={t} tt={tt} f={f} />
      </div>
    ));
  // Se marcan como vistos al abrir la alerta (se muestran resaltados solo esta vez).
  if (matches.some((m) => !m.seen)) await markMatchesSeen(id);

  const mode = c.mode ?? "flight";
  const facts = [
    mode === "hotel"
      ? [t("factMode"), t("hotelOnly")]
      : mode === "compare"
        ? [t("factMode"), t("compareTitle")]
        : [t("factNotify"), c.notifyMode === "flight" ? t("notifyFlight") : t("notifyFlightHotel")],
    mode === "hotel"
      ? [t("factGuests"), t("passengers", { n: c.flight.passengers })]
      : [t("factFlight"), `≤ ${f.eur(c.flight.maxPrice)} · ${f.stops(c.flight.maxStops)} · ${t("passengers", { n: c.flight.passengers })}`],
    [
      t("factDates"),
      [
        f.datesLabel(c.dates),
        !c.dates.dayTrip && t("nightsRange", { min: c.dates.minNights, max: c.dates.maxNights }),
        c.dates.times && t("withTimes"),
      ]
        .filter(Boolean)
        .join(" · "),
    ],
    [
      t("factHotel"),
      c.hotel
        ? `${c.hotel.types.map((ht) => t(`hotelType_${ht}`)).join(", ")}${c.hotel.maxPricePerNight ? ` ${t("maxPerNight", { price: f.eur(c.hotel.maxPricePerNight) })}` : ""}`
        : t("no"),
    ],
  ];

  return (
    <div className="space-y-5">
      <Link href="/alerts" className="eyebrow-pill transition hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5 rtl:-scale-x-100" /> {t("back")}
      </Link>

      <section className="animate-rise hero p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium text-white/70">
              {alert.active ? (
                <span className="radar relative inline-block h-2 w-2 rounded-full bg-cyan text-cyan" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-white/40" />
              )}
              {booked.length ? t("stateBooked") : alert.active ? t("stateSearchingEvery", { h: c.checkEveryHours }) : t("statePaused")} ·{" "}
              {f.ago(alert.lastRunAt)}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-balance">{c.name}</h1>
            <p className="mt-1 text-sm text-white/75">
              {mode === "compare" && c.originPlace ? (
                <span>{c.originPlace.label.split(",")[0]}</span>
              ) : mode !== "hotel" ? (
                <span className="font-mono">{c.origins.join(" · ")}</span>
              ) : null}
              {mode !== "hotel" && <> <span className="inline-block rtl:-scale-x-100">→</span>{" "}</>}
              {c.destination.kind === "place" ? c.destination.place.label.split(",").slice(0, 2).join(",") : t("anywhere")}
              {c.destinationAirports.length ? ` (${c.destinationAirports.join(", ")})` : ""}
            </p>
          </div>
          {bestPrice !== null && (
            <div className="shrink-0 text-end">
              <p className="text-xs text-white/65">{t("from")}</p>
              <p className="text-2xl font-extrabold tabular-nums">{f.eur(bestPrice)}</p>
            </div>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k} className="glass-tile px-3 py-2">
              <dt className="text-xs text-white/60">{k}</dt>
              <dd className="font-medium first-letter:uppercase">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <AlertActions id={id} active={alert.active} />
      {c.mode === "compare" && <CompareCard rows={s?.compare ?? []} t={t} f={f} />}

      {booked.length > 0 ? (
        <section className="space-y-3">
          <div className="card-glow flex items-start gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-good-soft text-good">
              <PartyPopper className="h-5 w-5" />
            </span>
            <div>
              <p className="font-bold">{t("bookedTitle")}</p>
              <p className="text-sm text-muted">{t("bookedText")}</p>
            </div>
          </div>
          {list(booked)}
        </section>
      ) : (
        alert.active && (
          <div className="card flex items-center gap-3 p-4">
            <StillSearching
              text={
                open.length ? t("stillSearchingMore", { h: c.checkEveryHours }) : t("stillSearching", { h: c.checkEveryHours })
              }
            />
          </div>
        )
      )}

      {pendingList.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">
            {t("pendingTitle")} <span className="font-normal text-muted">({pendingList.length})</span>
          </h2>
          {list(pendingList)}
        </section>
      )}

      {savedList.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">
            {t("savedTitle")} <span className="font-normal text-muted">({savedList.length})</span>
          </h2>
          {list(savedList)}
        </section>
      )}

      {!open.length && !booked.length && (
        <div className="card flex flex-col items-center gap-2 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-cyan">
            <Radar className="h-6 w-6" />
          </span>
          <p className="font-bold">{dismissed.length ? t("allReviewed") : t("nothingYet")}</p>
          <p className="max-w-sm text-sm text-muted">
            {alert.active
              ? t("nothingYetActive")
              : t("nothingYetPaused")}
          </p>
        </div>
      )}

      {c.mode !== "hotel" && (
        <PriceInsights summary={s ?? null} history={history} selectedMonths={c.dates.months} maxPrice={c.flight.maxPrice} />
      )}

      {dismissed.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-1 py-2 text-sm font-semibold text-muted">
            {t("dismissedTitle", { n: dismissed.length })}
            <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
          </summary>
          <div className="mt-3 space-y-3 opacity-80">{list(dismissed)}</div>
        </details>
      )}

      {s?.groundOnly && c.groundFrom && (
        <section className="card space-y-3">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-muted">
              <TrainFront className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">{t("groundOnlyTitle", { place: c.groundFrom.label.split(",")[0] })}</h2>
              <p className="hint">{t("groundOnlyLead")}</p>
            </div>
          </div>
          <GroundOptions
            options={s.groundOnlyOptions ?? [s.groundOnly]}
            from={c.groundFrom}
            to={c.destination.kind === "place" ? c.destination.place : undefined}
            country={c.destination.kind === "place" ? c.destination.place.country : undefined}
            t={tt}
            f={f}
          />
        </section>
      )}

      {s && (
        <details className="card group" open={!matches.length && s.notes.length > 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span>
              <span className="block font-semibold">{t("lastRunTitle")}</span>
              <span className="hint">
                {t("lastRunSummary", { windows: s.windows, matches: s.flightMatches })} · {f.ago(s.at)}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" />
          </summary>
          {/* El embudo: de todas las fechas posibles a las ofertas que cumplen. */}
          <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              [t("funnelWindows"), s.windows],
              [t("funnelScreened"), s.screened],
              [t("funnelCandidates"), s.candidates],
              [t("funnelConfirmed"), s.confirmed],
              [t("funnelMatches"), s.flightMatches],
            ].map(([label, n]) => (
              <li key={label} className="rounded-2xl bg-surface-2 p-3">
                <p className="text-xl font-semibold tabular-nums">{n}</p>
                <p className="hint">{label}</p>
              </li>
            ))}
          </ol>
          {s.notes.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 ps-5 text-xs text-muted">
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

export default function AlertPage({ params }: PageProps<"/[lang]/alerts/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <AlertContent params={params} />
    </Suspense>
  );
}
