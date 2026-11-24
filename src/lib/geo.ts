import airportsData from "@/data/airports.json";
import { cached } from "./db";
import type { Region } from "./types";
import { INTL_TAG, type Locale } from "../i18n/config";
import { makeT } from "../i18n/core";
import { MESSAGES } from "../i18n/messages";

export type Airport = {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  large: boolean;
  // Región del mundo (para «Sorpréndeme»).
  region: Region;
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
  // Para elegir bien en la lista: "Ciudad", "Calle"… (en el idioma de quien busca).
  kind: string;
  population?: number;
  // Habitantes ya escritos en el idioma de quien busca: "15,7 M hab.", "pop. 15.7M"…
  populationLabel?: string;
  // Tipo sin traducir (city, town, street…) para la interfaz.
  kindId?: string;
};

type PlaceKind = "city" | "town" | "hamlet" | "locality" | "suburb" | "province" | "state" | "county" | "island" | "hotel" | "station" | "airport" | "street" | "place";
type RawHit = Omit<PlaceHit, "kind" | "populationLabel"> & { kind: PlaceKind };

const PHOTON_KIND: Record<string, PlaceKind> = {
  city: "city",
  town: "town",
  village: "town",
  hamlet: "hamlet",
  locality: "locality",
  suburb: "suburb",
  neighbourhood: "suburb",
  quarter: "suburb",
  province: "province",
  state: "state",
  county: "county",
  island: "island",
  hotel: "hotel",
  station: "station",
  aerodrome: "airport",
};
const STREETS = ["residential", "living_street", "primary", "secondary", "tertiary", "unclassified", "service", "pedestrian", "footway", "track"];

// Idiomas en que Open-Meteo (GeoNames) devuelve los nombres; si no, inglés.
const GEONAMES_LANGS: readonly string[] = ["es", "en", "pt", "fr", "it", "de", "zh", "ja", "ko", "ar", "ru", "hi", "id"];
// Photon solo traduce a estos; en el resto, el nombre local.
const PHOTON_LANGS: readonly string[] = ["en", "de", "fr"];

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

// Ciudades por su nombre en tu idioma (GeoNames vía Open-Meteo, gratis y sin clave): "Estambul", "Cracovia", "Londres"…
async function searchCities(q: string, limit: number, locale: Locale): Promise<RawHit[]> {
  const lang = GEONAMES_LANGS.includes(locale) ? locale : "en";
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${limit}&language=${lang}&format=json`;
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
      kind: r.feature_code?.startsWith("PPL") ? ((r.population ?? 0) >= 50000 ? "city" : "town") : "place",
      population: r.population || undefined,
    }));
}

// Direcciones, hoteles, barrios… con Photon (OpenStreetMap).
async function searchPhoton(q: string, limit: number, locale: Locale): Promise<RawHit[]> {
  const lang = PHOTON_LANGS.includes(locale) ? locale : "default";
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit}&lang=${lang}`;
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
      kind: PHOTON_KIND[v] ?? (STREETS.includes(v) ? "street" : "place"),
    };
  });
}

// Geocodificación gratuita: primero las ciudades (de más a menos habitantes) y después el resto de lugares, sin repetidos.
export async function searchPlaces(q: string, limit = 7, locale: Locale = "es"): Promise<PlaceHit[]> {
  const [cities, places] = await Promise.all([searchCities(q, 5, locale).catch(() => []), searchPhoton(q, 6, locale).catch(() => [])]);
  const out: RawHit[] = [];
  for (const p of [...cities.sort((a, b) => (b.population ?? 0) - (a.population ?? 0)), ...places]) {
    const dup = out.some((o) => o.label === p.label || (o.kind === p.kind && haversineKm(o.lat, o.lon, p.lat, p.lon) < 3));
    if (!dup) out.push(p);
  }
  // Textos en el idioma de quien busca (sin "server-only": este módulo también lo usa el worker).
  const t = makeT(locale, MESSAGES.places[locale], MESSAGES.places.es);
  const num = (n: number, digits: number) => new Intl.NumberFormat(INTL_TAG[locale], { maximumFractionDigits: digits }).format(n);
  return out.slice(0, limit).map((p) => ({
    ...p,
    kind: t(`kind_${p.kind}`),
    kindId: p.kind,
    populationLabel:
      p.population && p.population >= 1000
        ? p.population >= 1e6
          ? t("popMillions", { n: num(p.population / 1e6, 1) })
          : t("popThousands", { n: num(Math.round(p.population / 1000), 0) })
        : undefined,
  }));
}

const AIRPORT_CITY: Record<string, string> = {
  NRT: "Tokyo", HND: "Tokyo", KIX: "Osaka", ICN: "Seoul", PVG: "Shanghai", EWR: "New York", JFK: "New York",
  CTS: "Sapporo", EZE: "Buenos Aires", GRU: "São Paulo", GIG: "Rio de Janeiro", CMB: "Colombo", BKK: "Bangkok",
  DPS: "Denpasar", HKT: "Phuket", PUJ: "Punta Cana", SJD: "San José del Cabo", FLL: "Fort Lauderdale",
  STN: "London", LGW: "London", LTN: "London", BGY: "Bergamo", BVA: "Beauvais", CRL: "Charleroi",
};

/**
 * Centro de la ciudad de un aeropuerto (los aeropuertos suelen estar lejos del centro): para buscar
 * alojamiento y el trayecto en «Sorpréndeme». Ciudad con ese nombre en ese país a menos de 80 km.
 */
export async function cityCenter(a: Airport): Promise<{ lat: number; lon: number; city: string }> {
  // Aeropuertos que llevan el nombre de un pueblo cercano y no de la ciudad a la que sirven.
  const city = AIRPORT_CITY[a.iata] ?? a.city;
  const fallback = { lat: a.lat, lon: a.lon, city };
  if (!city) return fallback;
  return cached(`city-center:v2:${a.iata}`, 180 * 86400, async () => {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.split(/[(/,]/)[0].trim())}&count=10&language=en&format=json`;
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return fallback;
      const json = (await res.json()) as { results?: GeoNamesHit[] };
      const best = (json.results ?? [])
        .filter((r) => r.country_code?.toUpperCase() === a.country && r.feature_code?.startsWith("PPL"))
        .map((r) => ({ r, km: haversineKm(a.lat, a.lon, r.latitude, r.longitude) }))
        .filter((x) => x.km < 100)
        .sort((x, y) => (y.r.population ?? 0) - (x.r.population ?? 0))[0];
      return best ? { lat: best.r.latitude, lon: best.r.longitude, city } : fallback;
    } catch {
      return fallback;
    }
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

// Destinos populares de todo el mundo etiquetados para alertas "a cualquier sitio".
export const THEMED_DESTINATIONS: Record<string, string[]> = {
  playa: ["PMI", "IBZ", "AGP", "ALC", "TFS", "LPA", "FAO", "NCE", "HER", "RHO", "JTR", "SPU", "DBV", "MLA", "CTA", "OLB", "CAG", "LCA", "AYT", "PFO",
    "CUN", "PUJ", "HAV", "VRA", "SJU", "MBJ", "AUA", "CUR", "PVR", "SJD", "CTG", "SSA", "REC", "NAT", "FLN", "DPS", "HKT", "KBV", "USM", "MLE", "CMB", "ZNZ", "MRU", "SEZ", "HRG", "SSH", "AGA", "DJE", "NBE", "HNL", "OGG", "MIA", "NAN", "PPT", "OOL", "CNS", "BKI", "LGK", "CEB", "PQC", "CXR", "GOI"],
  ciudad: ["PAR", "CDG", "ORY", "LON", "LHR", "LGW", "STN", "AMS", "BER", "ROM", "FCO", "MIL", "MXP", "LIS", "OPO", "PRG", "VIE", "BUD", "KRK", "WAW", "CPH", "DUB", "BRU", "IST", "ATH", "EDI", "MAD", "BCN",
    "JFK", "EWR", "LAX", "SFO", "ORD", "BOS", "LAS", "YYZ", "YUL", "YVR", "MEX", "BOG", "LIM", "EZE", "SCL", "GRU", "GIG", "MVD", "PTY", "NRT", "HND", "KIX", "ICN", "PEK", "PVG", "HKG", "TPE", "BKK", "SIN", "KUL", "SGN", "HAN", "DEL", "BOM", "DXB", "DOH", "AUH", "TLV", "CAI", "CMN", "RAK", "JNB", "CPT", "NBO", "SYD", "MEL", "AKL"],
  montaña: ["INN", "GVA", "ZRH", "SZG", "TRN", "BIO", "OVD", "TLS", "LYS",
    "DEN", "YYC", "SLC", "CUZ", "MDZ", "BRC", "KTM", "ZQN"],
  nieve: ["INN", "GVA", "SZG", "TRN", "LYS", "KTT", "RVN", "TOS",
    "DEN", "YVR", "SLC", "CTS", "ZQN", "BRC"],
  cultura: ["ROM", "FCO", "FLR", "PSA", "VCE", "NAP", "ATH", "IST", "PRG", "VIE", "KRK", "SVQ", "GRX", "MRS", "BOD",
    "CAI", "LXR", "RAK", "FEZ", "CUZ", "LIM", "MEX", "OAX", "KIX", "PEK", "XIY", "DEL", "JAI", "SAI", "RGN", "AMM", "TLV", "SKD"],
  fiesta: ["IBZ", "BUD", "BER", "AMS", "PRG", "KRK", "RIX", "TLL", "BEG",
    "GIG", "MIA", "LAS", "BKK", "SSA", "MSY"],
  naturaleza: ["KEF", "TOS", "BGO", "OSL", "FNC", "PDL", "TFN", "INV", "SPU",
    "SJO", "LIR", "UIO", "GPS", "PUQ", "FTE", "IGU", "MAO", "JRO", "VFA", "WDH", "CPT", "ZQN", "AKL", "CHC", "CNS", "ANC", "YYC", "DPS"],
};
