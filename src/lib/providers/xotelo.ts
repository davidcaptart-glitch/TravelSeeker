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
];

/**
 * Código de ciudad de TripAdvisor ("g187147") para el lugar. Se prueban los lugares poblados
 * cercanos con código, de más a menos habitantes, y se acepta el primero cuyos alojamientos
 * estén de verdad alrededor del destino (descarta regiones, países y pueblos vecinos).
 */
export async function tripadvisorGeo(place: Place, radiusKm = 8): Promise<string | null> {
  const known = KNOWN_GEOS.find((k) => haversineKm(k.lat, k.lon, place.lat, place.lon) < 15);
  if (known) return known.geo;
  return cached(`ta-geo:${place.lat.toFixed(2)},${place.lon.toFixed(2)}`, 90 * 86400, async () => {
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
    const geos = [...new Set(json.results.bindings.map((b) => b.ta.value).filter((v) => /^\d+$/.test(v)))];
    for (const ta of geos) {
      const list = await xoteloList(`g${ta}`).catch(() => []);
      const near = list.filter(
        (h) => h.geo && haversineKm(h.geo.latitude, h.geo.longitude, place.lat, place.lon) <= radiusKm,
      ).length;
      if (list.length && near / list.length >= 0.3) return `g${ta}`;
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

/** Precio más bajo por noche entre las agencias (null si no hay disponibilidad). */
async function xoteloRate(key: string, checkIn: string, checkOut: string, adults: number): Promise<number | null> {
  return cached(`xotelo:rate:${key}:${checkIn}:${checkOut}:${adults}`, 12 * 3600, async () => {
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
    const json = (await res.json()) as { result?: { rates?: { rate: number }[] } };
    const rates = (json.result?.rates ?? []).map((r) => r.rate).filter((r) => r > 0);
    return rates.length ? Math.min(...rates) : null;
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
  wanted: { types: HotelOffer["type"][]; maxPricePerNight?: number; minRating?: number },
  radiusKm = 8,
): Promise<XoteloSearch> {
  const geo = await tripadvisorGeo(place, radiusKm);
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
    const rates = await Promise.all(chunk.map(({ h }) => xoteloRate(h.key, checkIn, checkOut, guests).catch(() => null)));
    chunk.forEach(({ h, type }, j) => {
      const rate = rates[j];
      if (!rate) return;
      offers.push({
        provider: "xotelo",
        name: h.name,
        type,
        pricePerNight: Math.round(rate),
        total: 0, // lo calcula el llamador con las noches
        rating: h.review_summary?.rating,
        lat: h.geo?.latitude,
        lon: h.geo?.longitude,
        link: h.url,
        image: h.image,
      });
    });
  }
  return { offers, available: true };
}
