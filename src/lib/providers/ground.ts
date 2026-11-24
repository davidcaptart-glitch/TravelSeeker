import { cached } from "../db";
import { addDays, diffDays, toISO } from "../dates";
import { haversineKm, nearestStation } from "../geo";
import { legCost, MODE_LABELS, taxiFare } from "../fares";
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
  from: { name: string; lat: number; lon: number; tz?: string };
  to: { name: string; lat: number; lon: number; tz?: string };
  duration: number;
  distance?: number;
  startTime?: string;
  endTime?: string;
  routeShortName?: string;
  agencyName?: string;
  agencyUrl?: string;
  routeUrl?: string;
  routeColor?: string;
  routeTextColor?: string;
  headsign?: string;
  ticketUrls?: { web?: string };
};

/** Hora local "HH:MM" de un instante UTC en la zona horaria de la parada. */
function localTime(iso?: string, tz?: string): string | undefined {
  if (!iso) return undefined;
  try {
    return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz ?? "UTC" }).format(new Date(iso));
  } catch {
    return undefined;
  }
}

const httpUrl = (u?: string) => (u && /^https?:\/\//.test(u) ? u : undefined);
const hex = (c?: string) => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : undefined);
type MotisItinerary = { duration: number; transfers: number; legs: MotisLeg[] };

// Todo menos aviones (los horarios oficiales también incluyen vuelos).
const ALL_MODES = "TRAM,SUBWAY,FERRY,BUS,COACH,RAIL,FUNICULAR,AERIAL_LIFT,CABLE_CAR";
// Solo autobuses (para comparar: el tren suele ganar en rapidez y esconde los autobuses directos).
const BUS_MODES = "TRAM,SUBWAY,BUS,COACH";

async function transitous(from: Pt, to: Pt, date: string, hourUtc: number | string, modes = ALL_MODES): Promise<MotisItinerary[]> {
  const hhmm = typeof hourUtc === "number" ? `${String(hourUtc).padStart(2, "0")}:00` : hourUtc;
  const time = `${proxyDate(date)}T${hhmm}:00Z`;
  const key = `transit:v2:${from.lat.toFixed(3)},${from.lon.toFixed(3)}>${to.lat.toFixed(3)},${to.lon.toFixed(3)}:${new Date(time).getUTCDay()}:${hhmm}${modes === ALL_MODES ? "" : ":bus"}`;
  return cached(key, 7 * 86400, async () => {
    try {
      const params = new URLSearchParams({
        fromPlace: `${from.lat},${from.lon}`,
        toPlace: `${to.lat},${to.lon}`,
        time,
        maxPreTransitTime: "1200",
        maxPostTransitTime: "1200",
        transitModes: modes,
      });
      const res = await fetch(`https://api.transitous.org/api/v5/plan?${params}`, { headers: UA });
      if (!res.ok) return [];
      const json = (await res.json()) as { itineraries?: MotisItinerary[] };
      return (json.itineraries ?? []).filter((it) => !it.legs.some((l) => /AIR|FLIGHT/.test(l.mode)));
    } catch {
      return [];
    }
  });
}

type MotisStop = { name: string; lat: number; lon: number; tz?: string; importance?: number; modes?: string[] };

const AIRPORT_WORDS =
  /air ?port|aeropuerto|aeroport|aéroport|aeroporto|flughafen|lentoasema|flygplats|lufthavn|lotnisko|letiště|letisko|repülőtér|zračna luka|luchthaven|aerodrom|havaalanı|terminal|\bT[1-5]\b/i;

/**
 * Paradas reales de transporte público del aeropuerto (terminales, estación de tren o metro), de los
 * horarios oficiales. El punto de referencia del aeropuerto suele caer en las pistas, lejos de cualquier parada.
 */
export async function airportStops(lat: number, lon: number): Promise<MotisStop[]> {
  return cached(`airport-stops:v2:${lat.toFixed(3)},${lon.toFixed(3)}`, 30 * 86400, async () => {
    try {
      const d = 0.035;
      const box = `min=${lat - d},${lon - d * 1.5}&max=${lat + d},${lon + d * 1.5}`;
      const res = await fetch(`https://api.transitous.org/api/v1/map/stops?${box}`, { headers: UA, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return [];
      const all = ((await res.json()) as MotisStop[]).filter(
        (s) => AIRPORT_WORDS.test(s.name) && (s.modes ?? []).some((m) => !/AIR|FLIGHT/.test(m)),
      );
      // Antes las de metro, tren o bus urbano que las de autocar de larga distancia; luego las más importantes.
      const local = (s: MotisStop) => (s.modes ?? []).some((m) => m !== "COACH");
      all.sort((a, b) => Number(local(b)) - Number(local(a)) || (b.importance ?? 0) - (a.importance ?? 0));
      const picked: MotisStop[] = [];
      for (const s of all) {
        if (picked.length >= 3) break;
        if (picked.every((p) => haversineKm(p.lat, p.lon, s.lat, s.lon) > 0.3)) picked.push(s);
      }
      return picked;
    } catch {
      return [];
    }
  });
}

/** Hora UTC "HH:MM" de una hora local en una zona horaria, con los cambios de horario incluidos. */
function localToUtc(date: string, hhmm: string, tz: string): string {
  const guess = new Date(`${date}T${hhmm}:00Z`);
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(guess);
    const [h, m] = parts.split(":").map(Number);
    const offset = h * 60 + m - (guess.getUTCHours() * 60 + guess.getUTCMinutes());
    const norm = ((offset + 12 * 60) % (24 * 60) + 24 * 60) % (24 * 60) - 12 * 60;
    const t = new Date(guess.getTime() - norm * 60_000);
    return t.toISOString().slice(11, 16);
  } catch {
    return hhmm;
  }
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
      ...(isTransit
        ? {
            departTime: localTime(l.startTime, l.from.tz),
            arriveTime: localTime(l.endTime, l.to.tz),
            agencyUrl: httpUrl(l.agencyUrl),
            routeUrl: httpUrl(l.routeUrl),
            // Enlace de compra con el viaje ya elegido (solo si la fecha consultada es la real).
            ticketUrl: httpUrl(l.ticketUrls?.web),
            headsign: l.headsign,
            color: hex(l.routeColor),
            textColor: hex(l.routeTextColor),
          }
        : {}),
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
    // Los transbordos del autocar no se cuentan aquí: el texto lo pone la interfaz en cada idioma.
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
  const fare = taxiFare(country, d.km, d.minutes, airportIata);
  return {
    kind: "taxi",
    label: "Taxi",
    minutes: d.minutes,
    cost: fare.min,
    costMax: fare.max,
    fixedFare: fare.fixed,
    legs: [{ mode: "TAXI", from: from.label, to: to.label, minutes: d.minutes, km: d.km, cost: fare.min }],
    estimated: !fare.fixed,
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
    hourUtc?: number | string;
    // Hora local mínima de salida para el autocar (p. ej. llegada del vuelo + 1 h).
    notBefore?: string;
    country?: string;
    airportIata?: string;
    includeTaxi?: boolean;
    noFlix?: boolean;
    // Buscar también solo en autobús (para comparar con el tren).
    alsoBus?: boolean;
  },
): Promise<GroundOption[]> {
  const hour = opts.hourUtc ?? 9;
  const out: GroundOption[] = [];
  let direct = await transitous(from, to, opts.date, hour);
  if (opts.alsoBus) {
    const bus = await transitous(from, to, opts.date, hour, BUS_MODES);
    const seen = new Set(direct.map((it) => it.duration));
    direct = [...direct, ...bus.filter((it) => !seen.has(it.duration))];
  }
  // Desde un aeropuerto sin paradas cerca del punto de referencia: se sale desde sus paradas reales.
  if (!direct.length && opts.airportIata) {
    for (const s of await airportStops(from.lat, from.lon)) {
      direct = await transitous({ label: from.label, lat: s.lat, lon: s.lon }, to, opts.date, hour);
      if (direct.length) break;
    }
  }
  // Fuera rutas desproporcionadas (vueltas enormes): como mucho 3 h o 4 veces lo que se tarda en coche.
  const roadKm = haversineKm(from.lat, from.lon, to.lat, to.lon) * 1.3;
  const maxSec = Math.max(3 * 3600, (roadKm / 50) * 3600 * 4);
  const fit = direct.filter((it) => it.duration <= maxSec).sort((a, b) => a.duration - b.duration);
  // Los dos más rápidos y, si se pidieron autobuses, también el autobús más rápido.
  const best = fit.slice(0, 2);
  if (opts.alsoBus) {
    const isBus = (it: MotisItinerary) => it.legs.every((l) => !["RAIL", "SUBURBAN", "REGIONAL_RAIL", "REGIONAL_FAST_RAIL", "LONG_DISTANCE", "HIGHSPEED_RAIL", "NIGHT_RAIL"].includes(l.mode));
    const bus = fit.find((it) => isBus(it) && !best.includes(it));
    if (bus) best.push(bus);
  }
  // Con horarios de un día equivalente, el enlace de compra llevaría a otra fecha: se quita.
  const sameDay = proxyDate(opts.date) === opts.date;
  for (const it of best) {
    const o = toOption(it, from, to, opts.country, opts.airportIata);
    if (!sameDay) for (const l of o.legs) delete l.ticketUrl;
    out.push(await priceFlixLegs(it, o, opts.date));
  }

  // Autocar FlixBus con precio real para trayectos largos (si no lo ha propuesto ya Transitous).
  const km = haversineKm(from.lat, from.lon, to.lat, to.lon);
  if (km > 50 && !opts.noFlix && !out.some((o) => o.legs.some((l) => isFlix(l.agency) && l.realPrice))) {
    const flix = await flixOption(from, to, { ...opts, hourUtc: typeof hour === "number" ? hour : Number(hour.slice(0, 2)) }).catch(() => null);
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
      if (!sameDay) for (const l of mid.legs) delete l.ticketUrl;
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
  // Se busca desde media hora después de aterrizar, en la hora local del aeropuerto.
  const tz = (await airportStops(airport.lat, airport.lon))[0]?.tz;
  let hour: number | string = arriveTime ? Math.min(22, Math.max(6, Number(arriveTime.slice(0, 2)))) : 10;
  if (arriveTime && tz) {
    const [h, m] = arriveTime.split(":").map(Number);
    const t = Math.min(23 * 60, h * 60 + m + 30);
    hour = localToUtc(date, `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`, tz);
  }
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
