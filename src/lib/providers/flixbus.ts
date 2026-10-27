import { cached } from "../db";
import { getAirport, haversineKm } from "../geo";

/**
 * FlixBus: la misma API pública que usa su web (sin clave ni cupo). Precios reales de bus
 * (y de los trenes que vende FlixTrain) por fecha. No es oficial: si falla, se usan estimaciones.
 */

const API = "https://global.api.flixbus.com";
const UA = { "User-Agent": "TravelSeeker/0.1 (alertas de viaje personales)" };

type Pt = { label: string; lat: number; lon: number };
export type FlixCity = { id: string; name: string; lat: number; lon: number };

type AutocompleteCity = { id: string; name: string; is_flixbus_city: boolean; location?: { lat: number; lon: number } };

async function autocomplete(q: string): Promise<AutocompleteCity[]> {
  return cached(`flix:ac:${q.toLowerCase()}`, 30 * 86400, async () => {
    const p = new URLSearchParams({ q, lang: "es", flixbus_cities_only: "true" });
    const res = await fetch(`${API}/search/autocomplete/cities?${p}`, { headers: UA, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`FlixBus ${res.status}`);
    return (await res.json()) as AutocompleteCity[];
  });
}

/** Poblaciones cercanas al punto (de más cerca a más lejos) según OpenStreetMap: primero ciudades, luego pueblos. */
async function nearbyTownNames(pt: Pt, radiusKm: number): Promise<string[]> {
  const names: string[] = [];
  for (const tags of ["osm_tag=place:city", "osm_tag=place:city&osm_tag=place:town"]) {
    const p = new URLSearchParams({ lat: String(pt.lat), lon: String(pt.lon), limit: "8", radius: String(radiusKm) });
    const res = await fetch(`https://photon.komoot.io/reverse?${p}&${tags}`, { headers: UA, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) continue;
    const json = (await res.json()) as { features?: { properties: { name?: string } }[] };
    names.push(...(json.features ?? []).map((f) => f.properties.name).filter((n): n is string => Boolean(n)));
  }
  return names;
}

/** Nombres con los que buscar el punto en FlixBus (para aeropuertos, su ciudad y su nombre). */
function hintsFor(label: string): string[] {
  const iata = label.match(/\b([A-Z]{3})$/)?.[1];
  const airport = iata ? getAirport(iata) : undefined;
  if (airport) return [airport.city, airport.name];
  return [label.split(/[,(]/)[0].trim()];
}

/**
 * Ciudad de FlixBus más útil para un punto: primero por el nombre del lugar y después por las
 * poblaciones cercanas, aceptando solo ciudades a menos de radiusKm.
 */
export async function flixCityNear(pt: Pt, radiusKm = 40): Promise<FlixCity | null> {
  return cached(`flix:city:${pt.lat.toFixed(2)},${pt.lon.toFixed(2)}:${radiusKm}`, 90 * 86400, async () => {
    const names = [
      ...new Set([...hintsFor(pt.label), ...(await nearbyTownNames(pt, radiusKm).catch(() => []))].filter(Boolean)),
    ];
    for (const name of names) {
      const cities = await autocomplete(name).catch(() => []);
      const ok = cities
        .filter((c) => c.is_flixbus_city && c.location)
        .map((c) => ({ c, km: haversineKm(c.location!.lat, c.location!.lon, pt.lat, pt.lon) }))
        .filter((x) => x.km <= radiusKm)
        .sort((a, b) => a.km - b.km)[0];
      if (ok) return { id: ok.c.id, name: ok.c.name, lat: ok.c.location!.lat, lon: ok.c.location!.lon };
    }
    return null;
  });
}

export type FlixTrip = {
  departure: string; // ISO con zona horaria
  arrival: string;
  minutes: number;
  price: number;
  transfers: number;
  fromStation: string;
  toStation: string;
  link: string;
};

type FlixResult = {
  status: string;
  departure: { date: string; station_id: string };
  arrival: { date: string; station_id: string };
  price: { total: number };
  legs?: unknown[];
};

function shopLink(from: FlixCity, to: FlixCity, date: string) {
  const [y, m, d] = date.split("-");
  const p = new URLSearchParams({ departureCity: from.id, arrivalCity: to.id, rideDate: `${d}.${m}.${y}`, adult: "1" });
  return `https://shop.flixbus.es/search?${p}`;
}

/** Viajes disponibles en una fecha (YYYY-MM-DD), con precio por persona. */
export async function flixTrips(from: FlixCity, to: FlixCity, date: string, adults = 1): Promise<FlixTrip[]> {
  return cached(`flix:trips:${from.id}>${to.id}:${date}:${adults}`, 6 * 3600, async () => {
    const [y, m, d] = date.split("-");
    const p = new URLSearchParams({
      from_city_id: from.id,
      to_city_id: to.id,
      departure_date: `${d}.${m}.${y}`,
      products: JSON.stringify({ adult: adults }),
      currency: "EUR",
      locale: "es",
      search_by: "cities",
      include_after_midnight_rides: "1",
    });
    const res = await fetch(`${API}/search/service/v4/search?${p}`, { headers: UA, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`FlixBus ${res.status}`);
    const json = (await res.json()) as {
      trips?: { results?: Record<string, FlixResult> }[];
      stations?: Record<string, { name: string }>;
    };
    const stations = json.stations ?? {};
    return (json.trips ?? [])
      .flatMap((t) => Object.values(t.results ?? {}))
      .filter((r) => r.status === "available" && r.price?.total > 0)
      .map((r) => ({
        departure: r.departure.date,
        arrival: r.arrival.date,
        minutes: Math.round((Date.parse(r.arrival.date) - Date.parse(r.departure.date)) / 60000),
        price: Math.round((r.price.total / adults) * 100) / 100,
        transfers: Math.max(0, (r.legs?.length ?? 1) - 1),
        fromStation: stations[r.departure.station_id]?.name ?? from.name,
        toStation: stations[r.arrival.station_id]?.name ?? to.name,
        link: shopLink(from, to, date),
      }));
  });
}

/**
 * El viaje más conveniente: entre los que salen a partir de una hora (local, "HH:MM"), el más
 * barato de los que no tardan mucho más que el más rápido.
 */
export function pickTrip(trips: FlixTrip[], notBefore?: string): FlixTrip | undefined {
  const after = notBefore ? trips.filter((t) => t.departure.slice(11, 16) >= notBefore) : trips;
  const pool = after.length ? after : trips;
  if (!pool.length) return undefined;
  const fastest = Math.min(...pool.map((t) => t.minutes));
  return pool.filter((t) => t.minutes <= fastest * 1.5 + 30).sort((a, b) => a.price - b.price || a.minutes - b.minutes)[0];
}
