import {
  BusFront,
  CarTaxiFront,
  ChevronDown,
  ExternalLink,
  Footprints,
  Plane,
  Ship,
  Sparkles,
  Ticket,
  TrainFront,
  TrainFrontTunnel,
  TramFront,
} from "lucide-react";
import type { Translator } from "@/i18n/core";
import type { Format } from "@/i18n/format";
import type { NsMessages } from "@/i18n/messages";
import { perPerson, recommend, taxiApps, transitApps, type AppLink } from "@/lib/transport";
import type { GroundOption, TransitLeg } from "@/lib/types";

type TransportT = Translator<NsMessages<"transport">>;
// Textos y formatos del idioma: los pasa quien pinta el componente (getT/getFormat en el servidor, useT/useFormat en el cliente).
type I18n = { t: TransportT; f: Format };

const RAIL = ["RAIL", "SUBURBAN", "REGIONAL_RAIL", "REGIONAL_FAST_RAIL", "LONG_DISTANCE", "HIGHSPEED_RAIL", "NIGHT_RAIL"];

type Pt = { label: string; lat: number; lon: number };

// Modos con nombre traducido (mode_WALK, mode_BUS…); el resto se muestra tal cual.
const MODES = [
  "WALK",
  "BUS",
  "COACH",
  "TRAM",
  "SUBWAY",
  "METRO",
  "FERRY",
  "RAIL",
  "SUBURBAN",
  "REGIONAL_RAIL",
  "REGIONAL_FAST_RAIL",
  "LONG_DISTANCE",
  "HIGHSPEED_RAIL",
  "NIGHT_RAIL",
  "TAXI",
  "FLIGHT",
] as const;
type Mode = (typeof MODES)[number];
const isMode = (m: string): m is Mode => (MODES as readonly string[]).includes(m);

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

function legName(l: TransitLeg, t: TransportT) {
  const mode = isMode(l.mode) ? t(`mode_${l.mode}`) : l.mode;
  return `${mode}${l.line ? ` ${l.line}` : ""}`;
}

/** Los extremos de un trayecto vienen guardados en español («Aeropuerto BCN»): se traducen al pintarlos. */
function place(name: string, t: TransportT) {
  const m = name.match(/^Aeropuerto ([A-Z]{3})$/);
  return m ? t("airport", { code: m[1] }) : name;
}

/** Cadena de transportes de una opción, con el color oficial de cada línea: [Aerobús A1] › [Metro L3]. */
function ModeChain({ legs, t }: { legs: TransitLeg[]; t: TransportT }) {
  const ride = legs.filter((l) => l.mode !== "WALK");
  return (
    <ol className="flex flex-wrap items-center gap-1">
      {ride.map((l, i) => {
        const Icon = modeIcon(l.mode);
        return (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted rtl:-scale-x-100">›</span>}
            <span
              className="inline-flex items-center gap-1 rounded-lg bg-surface-3 px-1.5 py-0.5 text-xs font-semibold"
              style={l.color ? { background: l.color, color: l.textColor ?? "#fff" } : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              {legName(l, t)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

type Tag = "tagRecommended" | "tagCheapest" | "tagFastest";

/** Cheapest y fastest para etiquetar las opciones cuando hay más de una. */
export function pickGround(options: GroundOption[]) {
  if (!options.length) return { cheapest: undefined, fastest: undefined };
  const cheapest = options.reduce((a, b) => (b.cost < a.cost ? b : a));
  const fastest = options.reduce((a, b) => (b.minutes < a.minutes ? b : a));
  return { cheapest, fastest };
}

function Price({ o, t, f }: { o: GroundOption } & I18n) {
  const real = o.legs.some((l) => l.realPrice);
  if (o.kind === "taxi") {
    return (
      <div className="shrink-0 text-end">
        <p className="font-bold tabular-nums">
          {o.costMax && o.costMax > o.cost ? `${f.eur(o.cost)}–${f.eur(o.costMax)}` : f.eur(o.cost)}
        </p>
        <p className="hint">{o.fixedFare ? t("fixedFare") : t("perTaxi")}</p>
      </div>
    );
  }
  return (
    <div className="shrink-0 text-end">
      <p className="font-bold tabular-nums" title={o.estimated ? t("estimateTitle") : t("realPriceTitle")}>
        {o.estimated ? "~" : ""}
        {f.eur(o.cost)}
      </p>
      {real ? (
        <span className="badge bg-good-soft text-good">{o.estimated ? t("partlyReal") : t("realPrice")}</span>
      ) : (
        <p className="hint">{t("perPerson")}</p>
      )}
    </div>
  );
}

function Links({ links }: { links: AppLink[] }) {
  if (!links.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {links.map((b) => (
        <a
          key={`${b.label}${b.url}`}
          href={b.url}
          target="_blank"
          rel="noreferrer"
          className={`${b.primary ? "btn-primary" : "btn-ghost"} min-h-9 px-3 text-xs`}
        >
          {b.label} <ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}

/** Enlaces útiles de cada opción: comprar el billete, la web del operador, la app de taxi o la ruta en el móvil. */
function linksFor(o: GroundOption, from: Pt | undefined, to: Pt | undefined, country: string | undefined, t: TransportT, lang: string): AppLink[] {
  if (o.kind === "taxi") {
    return from && to ? taxiApps(country, from, to) : o.mapsLink ? [{ label: t("viewRoute"), url: o.mapsLink }] : [];
  }
  const out: AppLink[] = [];
  const ticket = o.legs.find((l) => l.ticketUrl);
  if (ticket) out.push({ label: ticket.line ? t("buyTicketLine", { line: ticket.line }) : t("buyTicket"), url: ticket.ticketUrl!, primary: true });
  // b.label es el nombre de la web o del operador (FlixBus, Trainline, Omio…): no se traduce.
  for (const b of o.bookingLinks ?? []) {
    if (b.label === "Google Maps") continue;
    out.push({
      label: b.label === "FlixBus" && o.legs.some((l) => l.realPrice) ? t("bookOn", { name: b.label }) : t("priceOn", { name: b.label }),
      url: b.url,
      primary: !out.length && b.label === "FlixBus",
    });
  }
  // Web de cada operador (una vez por operador).
  const seen = new Set<string>();
  for (const l of o.legs) {
    if (!l.agency || !l.agencyUrl || seen.has(l.agency) || seen.size >= 2) continue;
    seen.add(l.agency);
    out.push({ label: t("operatorSite", { name: l.agency.replace(/\s*\(.*\)$/, "") }), url: l.agencyUrl });
  }
  if (from && to) out.push(...transitApps(from, to, lang).slice(0, 2));
  else if (o.mapsLink) out.push({ label: t("viewOnMap"), url: o.mapsLink });
  return out;
}

function Steps({ o, t, f }: { o: GroundOption } & I18n) {
  if (o.legs.length < 2) return null;
  return (
    <details className="group mt-2">
      <summary className="hint flex cursor-pointer list-none items-center gap-1 font-semibold">
        {t("stepByStep")} <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
      </summary>
      <ol className="mt-2 space-y-2 border-s-2 border-border ps-3 text-xs">
        {o.legs.map((l, j) => {
          const Icon = modeIcon(l.mode);
          return (
            <li key={j} className="flex justify-between gap-2">
              <span className="flex gap-1.5">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                <span>
                  <b>{legName(l, t)}</b>
                  {l.headsign ? ` ${t("towards", { headsign: l.headsign })}` : ""}
                  {l.agency ? ` (${l.agency})` : ""}: {place(l.from, t)} → {place(l.to, t)}
                  {l.routeUrl && (
                    <>
                      {" · "}
                      <a href={l.routeUrl} target="_blank" rel="noreferrer" className="font-semibold text-accent">
                        {t("viewLine")}
                      </a>
                    </>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-muted tabular-nums">
                {l.departTime ? `${l.departTime} · ` : ""}
                {f.minutes(l.minutes)}
                {l.cost ? ` · ${l.realPrice ? "" : "~"}${f.eur(l.cost)}` : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

function OptionCard({
  o,
  tags,
  from,
  to,
  country,
  pax,
  reason,
  t,
  f,
}: {
  o: GroundOption;
  tags: Tag[];
  from?: Pt;
  to?: Pt;
  country?: string;
  pax: number;
  reason?: string;
} & I18n) {
  const rides = o.legs.filter((l) => l.mode !== "WALK");
  const first = rides.find((l) => l.departTime);
  const last = [...rides].reverse().find((l) => l.arriveTime);
  return (
    <li className={reason ? "card-glow p-3.5" : "rounded-2xl p-3"} style={reason ? undefined : { boxShadow: "inset 0 0 0 1px var(--hairline)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) =>
                tag === "tagRecommended" ? (
                  <span key={tag} className="badge bg-gradient-brand text-white">
                    <Sparkles className="h-3 w-3" /> {t(tag)}
                  </span>
                ) : (
                  <span key={tag} className="badge bg-accent-soft text-accent">
                    {t(tag)}
                  </span>
                ),
              )}
            </div>
          )}
          <ModeChain legs={o.legs} t={t} />
          <p className="hint">
            {f.minutes(o.minutes)}
            {o.kind !== "taxi" && rides.length >= 1 ? ` · ${t("transfers", { n: rides.length - 1 })}` : ""}
            {first?.departTime ? ` · ${t("departs", { time: first.departTime })}` : ""}
            {last?.arriveTime ? `, ${t("arrives", { time: last.arriveTime })}` : ""}
            {o.kind === "taxi" && pax > 1 ? ` · ${t("perPersonApprox", { amount: f.eur(perPerson(o, pax)) })}` : ""}
          </p>
        </div>
        <Price o={o} t={t} f={f} />
      </div>
      {reason && <p className="mt-2 text-sm">{reason}</p>}
      {o.kind === "taxi" && (
        <p className="hint mt-2 flex items-start gap-1.5">
          <CarTaxiFront className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {o.fixedFare ? t("taxiFixedHint") : t("taxiHint")}
        </p>
      )}
      <Steps o={o} t={t} f={f} />
      <Links links={linksFor(o, from, to, country, t, f.locale)} />
      {o.legs.some((l) => l.ticketUrl) && (
        <p className="hint mt-2 flex items-center gap-1.5">
          <Ticket className="h-3.5 w-3.5" /> {t("ticketHint")}
        </p>
      )}
    </li>
  );
}

/**
 * Cómo ir de A a B: la opción recomendada arriba (con el porqué) y el resto debajo.
 * from/to/country permiten abrir las apps de taxi y de transporte con el trayecto ya puesto.
 * t/f: textos del espacio "transport" y formatos del idioma (en el servidor, getT("transport") y getFormat()).
 */
export function GroundOptions({
  options,
  from,
  to,
  country,
  pax = 1,
  t,
  f,
}: {
  options: GroundOption[];
  from?: Pt;
  to?: Pt;
  country?: string;
  pax?: number;
} & I18n) {
  if (!options.length) return <p className="hint">{t("noRoute")}</p>;
  const { cheapest, fastest } = pickGround(options);
  const { best, reason } = recommend(options, pax, t, f);
  const rest = options.filter((o) => o !== best).sort((a, b) => perPerson(a, pax) - perPerson(b, pax));
  const tagsOf = (o: GroundOption) =>
    [o === best && "tagRecommended", options.length > 1 && o === cheapest && "tagCheapest", options.length > 1 && o === fastest && "tagFastest"].filter(
      (tag): tag is Tag => Boolean(tag),
    );
  return (
    <ul className="space-y-2">
      {best && <OptionCard o={best} tags={tagsOf(best)} from={from} to={to} country={country} pax={pax} reason={reason} t={t} f={f} />}
      {rest.map((o, i) => (
        <OptionCard key={i} o={o} tags={tagsOf(o)} from={from} to={to} country={country} pax={pax} t={t} f={f} />
      ))}
    </ul>
  );
}
