import airportsData from "@/data/airports.json";
import { cached } from "./db";

export type Airport = {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  large: boolean;
};

export const airports = airportsData as Airport[];
const byIata = new Map(airports.map((a) => [a.iata, a]));

export function getAirport(iata: string): Airport | undefined {
  return byIata.get(iata);
}

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearbyAirports(lat: number, lon: number, radiusKm: number, limit = 6): (Airport & { km: number })[] {
  return airports
    .map((a) => ({ ...a, km: haversineKm(lat, lon, a.lat, a.lon) }))
    .filter((a) => a.km <= radiusKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function searchAirports(q: string, limit = 8): Airport[] {
  const n = normalize(q.trim());
  if (!n) return [];
  const scored: { a: Airport; s: number }[] = [];
  for (const a of airports) {
    let s = 0;
    if (a.iata.toLowerCase() === n) s = 100;
    else if (normalize(a.city).startsWith(n)) s = 60;
    else if (normalize(a.name).includes(n)) s = 40;
    else if (normalize(a.city).includes(n)) s = 30;
    if (s) scored.push({ a, s: s + (a.large ? 5 : 0) });
  }
  return scored.sort((x, y) => y.s - x.s).slice(0, limit).map((x) => x.a);
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; city?: string; state?: string; country?: string; countrycode?: string; osm_value?: string };
};

const UA = { "User-Agent": "TravelSeeker/0.1 (alertas de viaje)" };

export type PlaceHit = {
  label: string;
  lat: number;
  lon: number;
  country?: string;
  // Para elegir bien en la lista: "Ciudad · 15,7 M hab.", "Calle"…
  kind: string;
  population?: number;
};

const PHOTON_KIND: Record<string, string> = {
  city: "Ciudad",
  town: "Pueblo",
  village: "Pueblo",
  hamlet: "Aldea",
  locality: "Localidad",
  suburb: "Barrio",
  neighbourhood: "Barrio",
  quarter: "Barrio",
  province: "Provincia",
  state: "Región",
  county: "Comarca",
  island: "Isla",
  hotel: "Hotel",
  station: "Estación",
  aerodrome: "Aeropuerto",
};
const STREETS = ["residential", "living_street", "primary", "secondary", "tertiary", "unclassified", "service", "pedestrian", "footway", "track"];

type GeoNamesHit = {
  name: string;
  latitude: number;
  longitude: number;
  country_code?: string;
  country?: string;
  admin1?: string;
  feature_code?: string;
  population?: number;
};

// Ciudades por su nombre en español (GeoNames vía Open-Meteo, gratis y sin clave): "Estambul", "Cracovia", "Londres"…
async function searchCities(q: string, limit: number): Promise<PlaceHit[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${limit}&language=es&format=json`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return [];
  const json = (await res.json()) as { results?: GeoNamesHit[] };
  return (json.results ?? [])
    .filter((r) => r.feature_code !== "AIRP")
    .map((r) => ({
      label: [r.name, r.admin1 !== r.name ? r.admin1 : undefined, r.country].filter(Boolean).join(", "),
      lat: r.latitude,
      lon: r.longitude,
      country: r.country_code?.toUpperCase(),
      kind: r.feature_code?.startsWith("PPL") ? ((r.population ?? 0) >= 50000 ? "Ciudad" : "Pueblo") : "Lugar",
      population: r.population || undefined,
    }));
}

// Direcciones, hoteles, barrios… con Photon (OpenStreetMap).
async function searchPhoton(q: string, limit: number): Promise<PlaceHit[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit}&lang=default`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return [];
  const json = (await res.json()) as { features: PhotonFeature[] };
  return json.features.map((f) => {
    const p = f.properties;
    const parts = [p.name, p.city !== p.name ? p.city : undefined, p.state, p.country].filter(Boolean);
    const v = p.osm_value ?? "";
    return {
      label: parts.join(", "),
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      country: p.countrycode?.toUpperCase(),
      kind: PHOTON_KIND[v] ?? (STREETS.includes(v) ? "Calle" : "Lugar"),
    };
  });
}

// Geocodificación gratuita: primero las ciudades (de más a menos habitantes) y después el resto de lugares, sin repetidos.
export async function searchPlaces(q: string, limit = 7): Promise<PlaceHit[]> {
  const [cities, places] = await Promise.all([searchCities(q, 5).catch(() => []), searchPhoton(q, 6).catch(() => [])]);
  const out: PlaceHit[] = [];
  for (const p of [...cities.sort((a, b) => (b.population ?? 0) - (a.population ?? 0)), ...places]) {
    const dup = out.some((o) => o.label === p.label || (o.kind === p.kind && haversineKm(o.lat, o.lon, p.lat, p.lon) < 3));
    if (!dup) out.push(p);
  }
  return out.slice(0, limit);
}

// Estación de tren más cercana a un punto (para montar rutas combinadas).
export async function nearestStation(lat: number, lon: number): Promise<{ label: string; lat: number; lon: number } | null> {
  const key = `station:${lat.toFixed(3)},${lon.toFixed(3)}`;
  return cached(key, 30 * 86400, async () => {
    try {
      const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&osm_tag=railway:station&radius=25&limit=1`;
      const res = await fetch(url, { headers: UA });
      if (!res.ok) return null;
      const json = (await res.json()) as { features: PhotonFeature[] };
      const f = json.features[0];
      if (!f) return null;
      return { label: f.properties.name ?? "Estación", lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
    } catch {
      return null;
    }
  });
}

// Destinos populares etiquetados para alertas "a cualquier sitio".
export const THEMED_DESTINATIONS: Record<string, string[]> = {
  playa: ["PMI", "IBZ", "AGP", "ALC", "TFS", "LPA", "FAO", "NCE", "HER", "RHO", "JTR", "SPU", "DBV", "MLA", "CTA", "OLB", "CAG", "LCA", "AYT", "PFO"],
  ciudad: ["PAR", "CDG", "ORY", "LON", "LHR", "LGW", "STN", "AMS", "BER", "ROM", "FCO", "MIL", "MXP", "LIS", "OPO", "PRG", "VIE", "BUD", "KRK", "WAW", "CPH", "DUB", "BRU", "IST", "ATH", "EDI", "MAD", "BCN"],
  montaña: ["INN", "GVA", "ZRH", "SZG", "TRN", "BIO", "OVD", "TLS", "LYS"],
  nieve: ["INN", "GVA", "SZG", "TRN", "LYS", "KTT", "RVN", "TOS"],
  cultura: ["ROM", "FCO", "FLR", "PSA", "VCE", "NAP", "ATH", "IST", "PRG", "VIE", "KRK", "SVQ", "GRX", "MRS", "BOD"],
  fiesta: ["IBZ", "BUD", "BER", "AMS", "PRG", "KRK", "RIX", "TLL", "BEG"],
  naturaleza: ["KEF", "TOS", "BGO", "OSL", "FNC", "PDL", "TFN", "INV", "SPU"],
};
