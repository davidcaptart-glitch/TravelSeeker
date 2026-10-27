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

// Geocodificación gratuita con Photon (OpenStreetMap).
export async function searchPlaces(q: string, limit = 6) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit}&lang=default`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return [];
  const json = (await res.json()) as { features: PhotonFeature[] };
  return json.features.map((f) => {
    const p = f.properties;
    const parts = [p.name, p.city !== p.name ? p.city : undefined, p.state, p.country].filter(Boolean);
    return {
      label: parts.join(", "),
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      country: p.countrycode?.toUpperCase(),
      kind: p.osm_value,
    };
  });
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
