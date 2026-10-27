import { cached } from "../db";
import { addDays, diffDays, toISO } from "../dates";
import { haversineKm, nearestStation } from "../geo";
import { legCost, MODE_LABELS, taxiCost } from "../fares";
import type { GroundOption, LastMile, TransitLeg } from "../types";
import { flixCityNear, flixTrips, pickTrip, type FlixCity } from "./flixbus";

// Rutas por tierra con APIs gratuitas:
//  - Transitous (MOTIS): tren, bus, metro... con horarios reales de toda Europa.
//  - FlixBus: precios reales de autocar para la fecha del viaje.
//  - OSRM: distancia y tiempo en coche para el taxi.
const UA = { "User-Agent": "TravelSeeker/0.1 (alertas de viaje)" };

type Pt = { label: string; lat: number; lon: number };

/**
 * Los horarios publicados solo cubren unas semanas. Para fechas lejanas consultamos
 * el mismo día de la semana dentro de los próximos 7-13 días: la oferta es representativa.
 */
function proxyDate(date: string): string {
  const today = toISO(new Date());
  if (diffDays(today, date) <= 13) return date;
  const target = new Date(`${date}T00:00:00Z`).getUTCDay();
  let d = addDays(today, 7);
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== target) d = addDays(d, 1);
  return d;
}

type MotisLeg = {
  mode: string;
  from: { name: string; lat: number; lon: number };
  to: { name: string; lat: number; lon: number };
  duration: number;
  distance?: number;
  routeShortName?: string;
  agencyName?: string;
};
type MotisItinerary = { duration: number; transfers: number; legs: MotisLeg[] };

async function transitous(from: Pt, to: Pt, date: string, hourUtc: number): Promise<MotisItinerary[]> {
  const time = `${proxyDate(date)}T${String(hourUtc).padStart(2, "0")}:00:00Z`;
  const key = `transit:${from.lat.toFixed(3)},${from.lon.toFixed(3)}>${to.lat.toFixed(3)},${to.lon.toFixed(3)}:${new Date(time).getUTCDay()}:${hourUtc}`;
  return cached(key, 7 * 86400, async () => {
    try {
      const params = new URLSearchParams({
        fromPlace: `${from.lat},${from.lon}`,
        toPlace: `${to.lat},${to.lon}`,
        time,
        maxPreTransitTime: "1200",
        maxPostTransitTime: "1200",
      });
      const res = await fetch(`https://api.transitous.org/api/v5/plan?${params}`, { headers: UA });
      if (!res.ok) return [];
      const json = (await res.json()) as { itineraries?: MotisItinerary[] };
      return json.itineraries ?? [];
    } catch {
      return [];
    }
  });
}

export async function drive(from: Pt, to: Pt): Promise<{ km: number; minutes: number }> {
  const key = `osrm:${from.lat.toFixed(4)},${from.lon.toFixed(4)}>${to.lat.toFixed(4)},${to.lon.toFixed(4)}`;
  return cached(key, 30 * 86400, async () => {
    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`,
        { headers: UA },
      );
      if (res.ok) {
        const json = (await res.json()) as { routes?: { distance: number; duration: number }[] };
        const r = json.routes?.[0];
        if (r) return { km: Math.round(r.distance / 100) / 10, minutes: Math.round(r.duration / 60) };
      }
    } catch {
      // se usa la estimación en línea recta
    }
    const km = haversineKm(from.lat, from.lon, to.lat, to.lon) * 1.3;
    return { km: Math.round(km * 10) / 10, minutes: Math.round((km / 55) * 60) };
  });
}

function mapsLink(from: Pt, to: Pt, mode: "transit" | "driving") {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${to.lat},${to.lon}&travelmode=${mode}`;
}

function bookingLinks(legs: TransitLeg[], from: Pt, to: Pt) {
  const links: { label: string; url: string }[] = [];
  const hasRail = legs.some((l) => /RAIL|SUBURBAN/.test(l.mode));
  const hasCoach = legs.some((l) => l.mode === "COACH" || (l.mode === "BUS" && l.km > 40));
  if (hasRail) links.push({ label: "Trainline", url: `https://www.thetrainline.com/es` });
  if (hasCoach) links.push({ label: "FlixBus", url: `https://www.flixbus.es/` });
  if (hasRail || hasCoach) links.push({ label: "Omio", url: `https://www.omio.es/` });
  links.push({ label: "Google Maps", url: mapsLink(from, to, "transit") });
  return links;
}

function toOption(it: MotisItinerary, from: Pt, to: Pt, country?: string, airportIata?: string): GroundOption {
  let firstTransit = true;
  const legs: TransitLeg[] = it.legs.map((l) => {
    const km = l.distance ? l.distance / 1000 : haversineKm(l.from.lat, l.from.lon, l.to.lat, l.to.lon);
    const isTransit = l.mode !== "WALK";
    const cost = legCost(l.mode, km, country, isTransit && firstTransit ? airportIata : undefined);
    if (isTransit) firstTransit = false;
    return {
      mode: l.mode,
      from: l.from.name === "START" ? from.label : l.from.name,
      to: l.to.name === "END" ? to.label : l.to.name,
      line: l.routeShortName,
      agency: l.agencyName,
      minutes: Math.round(l.duration / 60),
      km: Math.round(km * 10) / 10,
      cost,
    };
  });
  const transitLegs = legs.filter((l) => l.mode !== "WALK");
  return {
    kind: "transit",
    label: transitLegs.map((l) => `${MODE_LABELS[l.mode] ?? l.mode}${l.line ? ` ${l.line}` : ""}`).join(" → ") || "A pie",
    minutes: Math.round(it.duration / 60),
    cost: sumCost(legs),
    legs,
    estimated: isEstimated(legs),
    mapsLink: mapsLink(from, to, "transit"),
    bookingLinks: bookingLinks(legs, from, to),
  };
}

const sumCost = (legs: TransitLeg[]) => Math.round(legs.reduce((s, l) => s + l.cost, 0) * 100) / 100;
const isEstimated = (legs: TransitLeg[]) => legs.some((l) => l.cost > 0 && !l.realPrice);
const isFlix = (agency?: string) => Boolean(agency && /flix/i.test(agency));

/**
 * Los tramos de FlixBus que propone Transitous llevan horario de un día equivalente:
 * se sustituye su precio estimado por el real de la fecha del viaje.
 */
async function priceFlixLegs(it: MotisItinerary, opt: GroundOption, date: string): Promise<GroundOption> {
  let changed = false;
  for (let i = 0; i < it.legs.length; i++) {
    const m = it.legs[i];
    const leg = opt.legs[i];
    if (!leg || !isFlix(m.agencyName)) continue;
    const [a, b] = await Promise.all([
      flixCityNear({ label: m.from.name, lat: m.from.lat, lon: m.from.lon }, 25),
      flixCityNear({ label: m.to.name, lat: m.to.lat, lon: m.to.lon }, 25),
    ]);
    if (!a || !b || a.id === b.id) continue;
    const trip = pickTrip(await flixTrips(a, b, date).catch(() => []), "07:00");
    if (!trip) continue;
    leg.cost = trip.price;
    leg.realPrice = true;
    changed = true;
    opt.bookingLinks = [{ label: "FlixBus", url: trip.link }, ...(opt.bookingLinks ?? []).filter((l) => l.label !== "FlixBus")];
  }
  if (changed) {
    opt.cost = sumCost(opt.legs);
    opt.estimated = isEstimated(opt.legs);
  }
  return opt;
}

/** Tramo desde/hasta la estación de FlixBus: la opción más barata (transporte público, combinada o taxi). */
async function connector(a: Pt, b: Pt, date: string, hourUtc: number, country?: string, airportIata?: string) {
  if (haversineKm(a.lat, a.lon, b.lat, b.lon) < 2) return null;
  const opts = await groundOptions(a, b, { date, hourUtc, country, airportIata, noFlix: true });
  return opts.sort((x, y) => x.cost - y.cost)[0] ?? null;
}

/**
 * Opción en autocar de FlixBus con precio real: ciudad FlixBus más cercana al origen y al destino,
 * más los tramos de acercamiento (Transitous o taxi, estimados).
 */
async function flixOption(
  from: Pt,
  to: Pt,
  opts: { date: string; hourUtc: number; notBefore?: string; country?: string; airportIata?: string },
): Promise<GroundOption | null> {
  const [a, b] = await Promise.all([flixCityNear(from), flixCityNear(to)]);
  if (!a || !b || a.id === b.id) return null;
  const trip = pickTrip(await flixTrips(a, b, opts.date).catch(() => []), opts.notBefore ?? "07:00");
  if (!trip) return null;

  const cityPt = (c: FlixCity, station: string): Pt => ({ label: station, lat: c.lat, lon: c.lon });
  const depHour = Number(trip.departure.slice(11, 13));
  const arrHour = Number(trip.arrival.slice(11, 13));
  const [before, after] = await Promise.all([
    connector(from, cityPt(a, trip.fromStation), opts.date, Math.max(5, depHour - 2), opts.country, opts.airportIata),
    connector(cityPt(b, trip.toStation), to, opts.date, Math.min(22, arrHour), opts.country),
  ]);
  const bus: TransitLeg = {
    mode: "COACH",
    from: trip.fromStation,
    to: trip.toStation,
    line: trip.transfers ? `${trip.transfers} transbordo(s)` : undefined,
    agency: "FlixBus",
    minutes: trip.minutes,
    km: Math.round(haversineKm(a.lat, a.lon, b.lat, b.lon)),
    cost: trip.price,
    realPrice: true,
    departTime: trip.departure.slice(11, 16),
  };
  const legs = [...(before?.legs ?? []), bus, ...(after?.legs ?? [])];
  const parts = [before?.label, `FlixBus ${trip.departure.slice(11, 16)}`, after?.label].filter(Boolean);
  return {
    kind: before || after ? "mixed" : "transit",
    label: parts.join(" → "),
    minutes: (before?.minutes ?? 0) + trip.minutes + (after?.minutes ?? 0) + (before ? 20 : 0) + (after ? 10 : 0),
    cost: sumCost(legs),
    legs,
    estimated: isEstimated(legs),
    mapsLink: mapsLink(from, to, "transit"),
    bookingLinks: [{ label: "FlixBus", url: trip.link }],
  };
}

async function taxiOption(from: Pt, to: Pt, country?: string, airportIata?: string): Promise<GroundOption> {
  const d = await drive(from, to);
  const cost = taxiCost(country, d.km, d.minutes, airportIata);
  return {
    kind: "taxi",
    label: "Taxi",
    minutes: d.minutes,
    cost,
    legs: [{ mode: "TAXI", from: from.label, to: to.label, minutes: d.minutes, km: d.km, cost }],
    estimated: cost > 0,
    mapsLink: mapsLink(from, to, "driving"),
  };
}

/**
 * Opciones para ir de A a B: transporte público directo; si no hay, ruta combinada
 * (transporte público hasta la estación más cercana al destino + taxi); y siempre el taxi.
 */
export async function groundOptions(
  from: Pt,
  to: Pt,
  opts: {
    date: string;
    hourUtc?: number;
    // Hora local mínima de salida para el autocar (p. ej. llegada del vuelo + 1 h).
    notBefore?: string;
    country?: string;
    airportIata?: string;
    includeTaxi?: boolean;
    noFlix?: boolean;
  },
): Promise<GroundOption[]> {
  const hour = opts.hourUtc ?? 9;
  const out: GroundOption[] = [];
  const direct = await transitous(from, to, opts.date, hour);
  const best = direct.sort((a, b) => a.duration - b.duration).slice(0, 2);
  for (const it of best) out.push(await priceFlixLegs(it, toOption(it, from, to, opts.country, opts.airportIata), opts.date));

  // Autocar FlixBus con precio real para trayectos largos (si no lo ha propuesto ya Transitous).
  const km = haversineKm(from.lat, from.lon, to.lat, to.lon);
  if (km > 50 && !opts.noFlix && !out.some((o) => o.legs.some((l) => isFlix(l.agency) && l.realPrice))) {
    const flix = await flixOption(from, to, { ...opts, hourUtc: hour }).catch(() => null);
    if (flix) out.push(flix);
  }

  if (!best.length) {
    // Rutas combinadas con taxi en los extremos sin transporte público (aeropuertos o pueblos sin estación).
    const destStation = await nearestStation(to.lat, to.lon);
    const originStation = await nearestStation(from.lat, from.lon);
    const far = (s: Pt | null, p: Pt) => s && haversineKm(s.lat, s.lon, p.lat, p.lon) > 0.5;
    const plans: { a: Pt; b: Pt; taxiBefore: boolean; taxiAfter: boolean }[] = [];
    if (far(destStation, to)) plans.push({ a: from, b: destStation!, taxiBefore: false, taxiAfter: true });
    if (far(originStation, from)) {
      plans.push({ a: originStation!, b: to, taxiBefore: true, taxiAfter: false });
      if (far(destStation, to)) plans.push({ a: originStation!, b: destStation!, taxiBefore: true, taxiAfter: true });
    }
    for (const p of plans) {
      const it = (await transitous(p.a, p.b, opts.date, hour)).sort((x, y) => x.duration - y.duration)[0];
      if (!it) continue;
      const mid = toOption(it, p.a, p.b, opts.country);
      const first = p.taxiBefore ? await taxiOption(from, p.a, opts.country, opts.airportIata) : null;
      const last = p.taxiAfter ? await taxiOption(p.b, to, opts.country) : null;
      const parts = [first, mid, last].filter((x): x is GroundOption => x !== null);
      out.push({
        kind: "mixed",
        label: parts.map((x) => x.label).join(" → "),
        minutes: parts.reduce((s, x) => s + x.minutes, 0) + 10 * (parts.length - 1),
        cost: Math.round(parts.reduce((s, x) => s + x.cost, 0) * 100) / 100,
        legs: parts.flatMap((x) => x.legs),
        estimated: parts.some((x) => x.estimated),
        mapsLink: mapsLink(from, to, "transit"),
        bookingLinks: mid.bookingLinks,
      });
      break;
    }
  }

  if (opts.includeTaxi !== false && haversineKm(from.lat, from.lon, to.lat, to.lon) < 250) {
    out.push(await taxiOption(from, to, opts.country, opts.airportIata));
  }
  return out;
}

export async function lastMile(
  airport: { iata: string; name: string; lat: number; lon: number; country: string },
  target: Pt,
  date: string,
  arriveTime?: string,
): Promise<LastMile> {
  const from = { label: `Aeropuerto ${airport.iata}`, lat: airport.lat, lon: airport.lon };
  const hour = arriveTime ? Math.min(22, Math.max(6, Number(arriveTime.slice(0, 2)))) : 10;
  // El autocar tiene que salir al menos una hora después de aterrizar.
  const notBefore = arriveTime ? `${String(Math.min(23, Number(arriveTime.slice(0, 2)) + 1)).padStart(2, "0")}:${arriveTime.slice(3, 5)}` : undefined;
  const options = await groundOptions(from, target, {
    date,
    hourUtc: hour,
    notBefore,
    country: airport.country,
    airportIata: airport.iata,
  });
  return { from, to: target, options };
}
