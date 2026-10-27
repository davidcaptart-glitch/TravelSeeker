import { cached } from "../db";
import { addDays, diffDays, toISO } from "../dates";
import { haversineKm, nearestStation } from "../geo";
import { legCost, MODE_LABELS, taxiCost } from "../fares";
import type { GroundOption, LastMile, TransitLeg } from "../types";

// Rutas por tierra con APIs gratuitas:
//  - Transitous (MOTIS): tren, bus, metro... con horarios reales de toda Europa.
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
    cost: Math.round(legs.reduce((s, l) => s + l.cost, 0) * 100) / 100,
    legs,
    estimated: true,
    mapsLink: mapsLink(from, to, "transit"),
    bookingLinks: bookingLinks(legs, from, to),
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
    estimated: true,
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
  opts: { date: string; hourUtc?: number; country?: string; airportIata?: string; includeTaxi?: boolean },
): Promise<GroundOption[]> {
  const hour = opts.hourUtc ?? 9;
  const out: GroundOption[] = [];
  const direct = await transitous(from, to, opts.date, hour);
  const best = direct.sort((a, b) => a.duration - b.duration).slice(0, 2);
  for (const it of best) out.push(toOption(it, from, to, opts.country, opts.airportIata));

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
        estimated: true,
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
  const options = await groundOptions(from, target, {
    date,
    hourUtc: hour,
    country: airport.country,
    airportIata: airport.iata,
  });
  return { from, to: target, options };
}
