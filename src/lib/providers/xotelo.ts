import { bookingLinksFor } from "./hotelLinks";
import { cached } from "../db";
import { haversineKm } from "../geo";
import type { HotelOffer, Place } from "../types";

/**
 * Xotelo: precios de alojamiento de TripAdvisor (Booking, Agoda, Trip.com…) gratis y sin clave.
 * Pide el código de ciudad de TripAdvisor, que sacamos de Wikidata (propiedad P3134).
 */

const API = "https://data.xotelo.com/api";
const UA = { "User-Agent": "TravelSeeker/0.1 (alertas de viaje personales)" };

// Ciudades cuyo elemento de Wikidata no tiene el código de TripAdvisor.
const KNOWN_GEOS: { lat: number; lon: number; geo: string }[] = [
  { lat: 50.0614, lon: 19.9372, geo: "g274772" }, // Cracovia
  // Grandes destinos (comprobados con Xotelo). Estambul, por ejemplo, no tiene el código en Wikidata.
  { lat: 41.0082, lon: 28.9784, geo: "g293974" }, // Estambul
  { lat: 48.8566, lon: 2.3522, geo: "g187147" }, // París
  { lat: 51.5074, lon: -0.1278, geo: "g186338" }, // Londres
  { lat: 41.9028, lon: 12.4964, geo: "g187791" }, // Roma
  { lat: 38.7223, lon: -9.1393, geo: "g189158" }, // Lisboa
  { lat: 41.3874, lon: 2.1686, geo: "g187497" }, // Barcelona
  { lat: 40.4168, lon: -3.7038, geo: "g187514" }, // Madrid
  { lat: 52.3676, lon: 4.9041, geo: "g188590" }, // Ámsterdam
  { lat: 52.52, lon: 13.405, geo: "g187323" }, // Berlín
  { lat: 50.0755, lon: 14.4378, geo: "g274707" }, // Praga
  { lat: 47.4979, lon: 19.0402, geo: "g274887" }, // Budapest
  { lat: 48.2082, lon: 16.3738, geo: "g190454" }, // Viena
  { lat: 37.9838, lon: 23.7275, geo: "g189400" }, // Atenas
  { lat: 53.3498, lon: -6.2603, geo: "g186605" }, // Dublín
  { lat: 45.4642, lon: 9.19, geo: "g187849" }, // Milán
  { lat: 45.4408, lon: 12.3155, geo: "g187870" }, // Venecia
  { lat: 43.7696, lon: 11.2558, geo: "g187895" }, // Florencia
  { lat: 41.1579, lon: -8.6291, geo: "g189180" }, // Oporto
  { lat: 50.8503, lon: 4.3517, geo: "g188644" }, // Bruselas
  { lat: 55.6761, lon: 12.5683, geo: "g189541" }, // Copenhague
  { lat: 55.9533, lon: -3.1883, geo: "g186525" }, // Edimburgo
  { lat: 31.6295, lon: -7.9811, geo: "g293734" }, // Marrakech
  { lat: 40.7128, lon: -74.006, geo: "g60763" }, // Nueva York
  // Resto del mundo (comprobados con Xotelo): ciudades grandes y extensas donde Wikidata no basta.
  { lat: 25.2048, lon: 55.2708, geo: "g295424" }, // Dubái
  { lat: 21.1619, lon: -86.8515, geo: "g150807" }, // Cancún
  { lat: 35.6762, lon: 139.6503, geo: "g298184" }, // Tokio
  { lat: -23.5505, lon: -46.6333, geo: "g303631" }, // São Paulo
  { lat: -22.9068, lon: -43.1729, geo: "g303506" }, // Río de Janeiro
  { lat: 19.4326, lon: -99.1332, geo: "g150800" }, // Ciudad de México
  { lat: -34.6037, lon: -58.3816, geo: "g312741" }, // Buenos Aires
  { lat: 22.3193, lon: 114.1694, geo: "g294217" }, // Hong Kong
  { lat: 37.5665, lon: 126.978, geo: "g294197" }, // Seúl
  { lat: 1.3521, lon: 103.8198, geo: "g294265" }, // Singapur
  { lat: 3.139, lon: 101.6869, geo: "g298570" }, // Kuala Lumpur
  { lat: 10.8231, lon: 106.6297, geo: "g293925" }, // Ho Chi Minh
  { lat: 21.0278, lon: 105.8342, geo: "g293924" }, // Hanói
  { lat: 7.8804, lon: 98.3923, geo: "g293920" }, // Phuket
  { lat: -8.7184, lon: 115.1686, geo: "g294226" }, // Bali (Kuta)
  { lat: -33.8688, lon: 151.2093, geo: "g255060" }, // Sídney
  { lat: -37.8136, lon: 144.9631, geo: "g255100" }, // Melbourne
  { lat: 37.7749, lon: -122.4194, geo: "g60713" }, // San Francisco
  { lat: 34.0522, lon: -118.2437, geo: "g32655" }, // Los Ángeles
  { lat: 25.7617, lon: -80.1918, geo: "g34438" }, // Miami
  { lat: 36.1699, lon: -115.1398, geo: "g45963" }, // Las Vegas
  { lat: 43.6532, lon: -79.3832, geo: "g155019" }, // Toronto
  { lat: 4.711, lon: -74.0721, geo: "g294074" }, // Bogotá
  { lat: -12.0464, lon: -77.0428, geo: "g294316" }, // Lima
  { lat: 23.1136, lon: -82.3666, geo: "g147271" }, // La Habana
  { lat: 18.5601, lon: -68.3725, geo: "g147293" }, // Punta Cana
  { lat: 30.0444, lon: 31.2357, geo: "g294201" }, // El Cairo
  { lat: -33.9249, lon: 18.4241, geo: "g1722390" }, // Ciudad del Cabo
  { lat: 25.2854, lon: 51.531, geo: "g294009" }, // Doha
  { lat: 24.4539, lon: 54.3773, geo: "g294013" }, // Abu Dabi
  { lat: 32.0853, lon: 34.7818, geo: "g293984" }, // Tel Aviv
  { lat: 39.9042, lon: 116.4074, geo: "g294212" }, // Pekín
  { lat: 31.2304, lon: 121.4737, geo: "g308272" }, // Shanghái
  { lat: 25.033, lon: 121.5654, geo: "g293913" }, // Taipéi
  { lat: 19.076, lon: 72.8777, geo: "g304554" }, // Bombay
  { lat: 35.0116, lon: 135.7681, geo: "g298564" }, // Kioto
  { lat: 34.6937, lon: 135.5023, geo: "g298566" }, // Osaka
  { lat: 45.5017, lon: -73.5673, geo: "g155032" }, // Montreal
  { lat: 49.2827, lon: -123.1207, geo: "g154943" }, // Vancouver
  { lat: -33.4489, lon: -70.6693, geo: "g294305" }, // Santiago de Chile
];

// Opcional: TripAdvisor Content API (plan gratuito con cupo mensual), solo para buscar el código de ciudad.
const TRIPADVISOR_KEY = process.env.TRIPADVISOR_KEY;

/** Códigos de lugares poblados cercanos según Wikidata (P3134), de más a menos habitantes. */
async function wikidataGeos(place: Place): Promise<string[]> {
  const q = `SELECT DISTINCT ?ta ?pop WHERE {
    SERVICE wikibase:around { ?item wdt:P625 ?loc . bd:serviceParam wikibase:center "Point(${place.lon} ${place.lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "12" . }
    ?item wdt:P1082 ?pop ; wdt:P3134 ?ta .
  } ORDER BY DESC(?pop) LIMIT 4`;
  const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, {
    headers: UA,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Wikidata ${res.status}`);
  const json = (await res.json()) as { results: { bindings: { ta: { value: string } }[] } };
  return [...new Set(json.results.bindings.map((b) => b.ta.value).filter((v) => /^\d+$/.test(v)))];
}

/** Búsqueda de ciudades con la API oficial de TripAdvisor (necesita TRIPADVISOR_KEY). */
async function tripadvisorApiGeos(place: Place): Promise<string[]> {
  if (!TRIPADVISOR_KEY) return [];
  const p = new URLSearchParams({
    key: TRIPADVISOR_KEY,
    searchQuery: place.label.split(",")[0].trim(),
    category: "geos",
    latLong: `${place.lat},${place.lon}`,
    radius: "30",
    radiusUnit: "km",
    language: "es",
  });
  const res = await fetch(`https://api.content.tripadvisor.com/api/v1/location/search?${p}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`TripAdvisor ${res.status}`);
  const json = (await res.json()) as { data?: { location_id: number | string }[]; error?: { message: string } };
  if (json.error) throw new Error(`TripAdvisor: ${json.error.message}`);
  return (json.data ?? []).map((d) => String(d.location_id)).filter((v) => /^\d+$/.test(v));
}

/**
 * Código de ciudad de TripAdvisor ("g187147") para el lugar. Candidatos de Wikidata y, si hay
 * clave, de la API de TripAdvisor; se acepta el primero cuyos alojamientos estén de verdad
 * alrededor del destino (descarta regiones, países y pueblos vecinos).
 */
export async function tripadvisorGeo(place: Place, radiusKm = 8): Promise<string | null> {
  const known = KNOWN_GEOS.find((k) => haversineKm(k.lat, k.lon, place.lat, place.lon) < 15);
  if (known) return known.geo;
  // Con clave se usa otra entrada de caché: un "no encontrado" sin clave no bloquea el reintento.
  const key = `ta-geo:${TRIPADVISOR_KEY ? "api:" : ""}${place.lat.toFixed(2)},${place.lon.toFixed(2)}`;
  return cached(key, 90 * 86400, async () => {
    const tried = new Set<string>();
    for (const source of [wikidataGeos, tripadvisorApiGeos]) {
      const geos = await source(place).catch(() => [] as string[]);
      for (const ta of geos) {
        if (tried.has(ta)) continue;
        tried.add(ta);
        const list = await xoteloList(`g${ta}`).catch(() => []);
        const near = list.filter(
          (h) => h.geo && haversineKm(h.geo.latitude, h.geo.longitude, place.lat, place.lon) <= radiusKm,
        ).length;
        if (list.length && near / list.length >= 0.3) return `g${ta}`;
      }
    }
    return null;
  });
}

type XoteloItem = {
  name: string;
  key: string;
  accommodation_type?: string;
  url?: string;
  review_summary?: { rating?: number };
  price_ranges?: { minimum?: number; maximum?: number };
  geo?: { latitude: number; longitude: number };
  image?: string;
};

async function xoteloList(geo: string): Promise<XoteloItem[]> {
  return cached(`xotelo:list:${geo}`, 7 * 86400, async () => {
    const out: XoteloItem[] = [];
    // Los primeros 300 por "mejor relación calidad-precio" bastan para encontrar los baratos.
    for (const offset of [0, 100, 200]) {
      const res = await fetch(`${API}/list?location_key=${geo}&limit=100&offset=${offset}&sort=best_value`, {
        headers: UA,
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Xotelo ${res.status}`);
      const json = (await res.json()) as { error?: { message: string }; result?: { list: XoteloItem[] } };
      if (json.error) throw new Error(`Xotelo: ${json.error.message}`);
      const list = json.result?.list ?? [];
      out.push(...list);
      if (list.length < 100) break;
    }
    // Las páginas pueden solaparse.
    return [...new Map(out.map((h) => [h.key, h])).values()];
  });
}

type XoteloRate = { code: string; name: string; rate: number };

/** Precio por noche en cada agencia (Booking.com, Agoda, Trip.com, web oficial…); vacío si no hay disponibilidad. */
async function xoteloRates(key: string, checkIn: string, checkOut: string, adults: number): Promise<XoteloRate[]> {
  return cached(`xotelo:rates:${key}:${checkIn}:${checkOut}:${adults}`, 12 * 3600, async () => {
    const p = new URLSearchParams({
      hotel_key: key,
      chk_in: checkIn,
      chk_out: checkOut,
      currency: "EUR",
      adults: String(adults),
      rooms: String(Math.ceil(adults / 2)),
    });
    const res = await fetch(`${API}/rates?${p}`, { headers: UA, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Xotelo ${res.status}`);
    const json = (await res.json()) as { result?: { rates?: XoteloRate[] } };
    return (json.result?.rates ?? []).filter((r) => r.rate > 0);
  });
}

function typeOf(t = "", name = ""): HotelOffer["type"] {
  if (/hostel/i.test(t) || /hostel|albergue|auberge/i.test(name)) return "hostel";
  if (/apartment|condo|vacation|villa|cottage|guest house/i.test(t)) return "apartment";
  return "hotel";
}

export type XoteloSearch = { offers: HotelOffer[]; available: boolean };

/**
 * Alojamientos con precio real. available = false si la ciudad no está en Xotelo
 * (para que el llamador pruebe otra fuente).
 */
export async function xoteloHotels(
  place: Place,
  checkIn: string,
  checkOut: string,
  guests: number,
  wanted: { types: HotelOffer["type"][]; maxPricePerNight?: number; minRating?: number; tripadvisorGeo?: string },
  radiusKm = 8,
): Promise<XoteloSearch> {
  // El código puesto a mano en la alerta manda sobre el que se busca en Wikidata.
  const geo = wanted.tripadvisorGeo ?? (await tripadvisorGeo(place, radiusKm));
  if (!geo) return { offers: [], available: false };
  const list = await xoteloList(geo);
  if (!list.length) return { offers: [], available: false };

  // Prefiltro con los datos de la lista (sin consultar precios todavía).
  const pre = list
    .map((h) => ({ h, type: typeOf(h.accommodation_type, h.name) }))
    .filter(({ h, type }) => {
      if (!wanted.types.includes(type)) return false;
      if (wanted.minRating && (h.review_summary?.rating ?? 0) < wanted.minRating) return false;
      if (wanted.maxPricePerNight && (h.price_ranges?.minimum ?? 0) > wanted.maxPricePerNight) return false;
      if (h.geo && haversineKm(h.geo.latitude, h.geo.longitude, place.lat, place.lon) > radiusKm) return false;
      return true;
    })
    .sort((a, b) => (a.h.price_ranges?.minimum ?? 9999) - (b.h.price_ranges?.minimum ?? 9999))
    .slice(0, 8);

  const offers: HotelOffer[] = [];
  for (let i = 0; i < pre.length; i += 4) {
    const chunk = pre.slice(i, i + 4);
    const rates = await Promise.all(chunk.map(({ h }) => xoteloRates(h.key, checkIn, checkOut, guests).catch(() => [] as XoteloRate[])));
    chunk.forEach(({ h, type }, j) => {
      if (!rates[j].length) return;
      const rate = Math.min(...rates[j].map((r) => r.rate));
      const bookingLinks = bookingLinksFor({ name: h.name, city: place.label.split(",")[0], checkIn, checkOut, guests }, rates[j]);
      offers.push({
        provider: "xotelo",
        name: h.name,
        type,
        pricePerNight: Math.round(rate),
        total: 0, // lo calcula el llamador con las noches
        rating: h.review_summary?.rating,
        lat: h.geo?.latitude,
        lon: h.geo?.longitude,
        // Reservar en la agencia más barata, con fechas y personas puestas.
        link: bookingLinks[0]?.url ?? h.url,
        bookingLinks,
        reviewsLink: h.url,
        image: h.image,
        usualMin: h.price_ranges?.minimum,
        usualMax: h.price_ranges?.maximum,
      });
    });
  }
  return { offers, available: true };
}
