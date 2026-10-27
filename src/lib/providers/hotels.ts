import { cached, peekCache } from "../db";
import { take } from "../quota";
import type { AlertConfig, HotelOffer, Place } from "../types";
import { hash, timeBucket } from "./mock";

import { xoteloHotels } from "./xotelo";

// Alojamiento: primero Xotelo (gratis, sin cupo). Si la ciudad no está, SerpApi Google Hotels
// (comparte el cupo gratuito con los vuelos) o, sin clave, datos simulados.
const SERPAPI_KEY = process.env.SERPAPI_KEY;
export const hotelProvider = SERPAPI_KEY ? "serpapi" : "mock";

type HotelCriteria = NonNullable<AlertConfig["hotel"]>;

export function hotelMatches(h: HotelOffer, c: HotelCriteria): boolean {
  if (!c.types.includes(h.type)) return false;
  if (c.maxPricePerNight && h.pricePerNight > c.maxPricePerNight) return false;
  if (c.maxTotal && h.total > c.maxTotal) return false;
  if (c.minRating && (h.rating ?? 0) < c.minRating) return false;
  // Algunas fuentes (Xotelo) no dan estrellas: entonces solo se filtra por nota.
  if (c.minStars && h.type === "hotel" && h.stars !== undefined && h.stars < c.minStars) return false;
  return true;
}

function mockHotels(place: Place, checkIn: string, checkOut: string, nights: number, guests: number): HotelOffer[] {
  const names = {
    hotel: ["Hotel Central", "Grand Hôtel du Parc", "Hotel Boutique Rivière", "Hotel Stare Miasto", "Hotel Avenida"],
    apartment: ["Apartamento con vistas", "Estudio en el centro", "Loft junto al río"],
    hostel: ["Generator Hostel", "Hostel Sun & Moon"],
  } as const;
  const out: HotelOffer[] = [];
  for (const type of ["hotel", "apartment", "hostel"] as const) {
    names[type].forEach((name, i) => {
      const h = hash(`${place.label}${name}${checkIn}${timeBucket()}`);
      const base = type === "hostel" ? 28 : type === "apartment" ? 70 : 85;
      const perNight = Math.round(base * (0.6 + h * 1.2) * Math.max(1, guests * 0.7));
      out.push({
        provider: "simulado",
        name,
        type,
        pricePerNight: perNight,
        total: perNight * nights,
        rating: Math.round((3.4 + h * 1.5) * 10) / 10,
        stars: type === "hotel" ? 2 + (i % 4) : undefined,
        lat: place.lat + (h - 0.5) * 0.03,
        lon: place.lon + (hash(name) - 0.5) * 0.03,
        link: `https://www.google.com/travel/hotels/${encodeURIComponent(place.label)}?q=${encodeURIComponent(`${name} ${place.label}`)}&dates=${checkIn},${checkOut}`,
      });
    });
  }
  return out;
}

type SerpProperty = {
  type?: string;
  name: string;
  link?: string;
  gps_coordinates?: { latitude: number; longitude: number };
  rate_per_night?: { extracted_lowest?: number };
  total_rate?: { extracted_lowest?: number };
  overall_rating?: number;
  extracted_hotel_class?: number;
  images?: { thumbnail?: string }[];
};

async function serpHotels(
  place: Place,
  checkIn: string,
  checkOut: string,
  guests: number,
  c: HotelCriteria,
  rentals: boolean,
): Promise<HotelOffer[] | null> {
  const key = `serp:h:${place.lat.toFixed(3)},${place.lon.toFixed(3)}:${checkIn}:${checkOut}:${guests}:${rentals}:${c.types.join(",")}`;
  const hit = await peekCache<HotelOffer[]>(key);
  if (hit) return hit;
  if (!(await take("serpapi"))) return null;
  return cached(key, 6 * 3600, async () => {
    const wantsHostel = c.types.includes("hostel") && !c.types.includes("hotel");
    const params = new URLSearchParams({
      engine: "google_hotels",
      q: `${wantsHostel ? "hostel" : rentals ? "apartment" : "hotel"} ${place.label}`,
      check_in_date: checkIn,
      check_out_date: checkOut,
      adults: String(guests),
      currency: "EUR",
      gl: "es",
      hl: "es",
      sort_by: "3", // precio más bajo
      api_key: SERPAPI_KEY!,
    });
    if (rentals) params.set("vacation_rentals", "true");
    if (c.maxPricePerNight) params.set("max_price", String(Math.ceil(c.maxPricePerNight)));
    if (c.minRating && c.minRating >= 3.5) params.set("rating", c.minRating >= 4.5 ? "9" : c.minRating >= 4 ? "8" : "7");
    if (!rentals && c.minStars && c.minStars >= 2) {
      params.set("hotel_class", [2, 3, 4, 5].filter((s) => s >= c.minStars!).join(","));
    }
    const res = await fetch(`https://serpapi.com/search.json?${params}`);
    if (!res.ok) throw new Error(`SerpApi hoteles ${res.status}`);
    const json = (await res.json()) as { properties?: SerpProperty[] };
    return (json.properties ?? [])
      .filter((p) => p.rate_per_night?.extracted_lowest)
      .map((p) => {
        const isHostel = /hostel|albergue|auberge/i.test(p.name);
        return {
          provider: "google-hotels",
          name: p.name,
          type: rentals ? "apartment" : isHostel ? "hostel" : "hotel",
          pricePerNight: p.rate_per_night!.extracted_lowest!,
          total: p.total_rate?.extracted_lowest ?? 0,
          rating: p.overall_rating,
          stars: p.extracted_hotel_class,
          lat: p.gps_coordinates?.latitude,
          lon: p.gps_coordinates?.longitude,
          link: p.link,
          image: p.images?.[0]?.thumbnail,
        } satisfies HotelOffer;
      });
  });
}

export type HotelSearch = { offers: HotelOffer[]; quotaExhausted: boolean };

export async function searchHotels(
  place: Place,
  checkIn: string,
  checkOut: string,
  nights: number,
  guests: number,
  criteria: HotelCriteria,
): Promise<HotelSearch> {
  let offers: HotelOffer[] = [];
  let quotaExhausted = false;
  const free = await xoteloHotels(place, checkIn, checkOut, guests, criteria).catch(() => null);
  if (free?.available) {
    offers = free.offers;
  } else if (hotelProvider === "mock") {
    offers = mockHotels(place, checkIn, checkOut, nights, guests);
  } else {
    const wantsHotels = criteria.types.some((t) => t !== "apartment");
    const wantsRentals = criteria.types.includes("apartment");
    for (const rentals of [false, true]) {
      if ((rentals && !wantsRentals) || (!rentals && !wantsHotels)) continue;
      const r = await serpHotels(place, checkIn, checkOut, guests, criteria, rentals);
      if (r === null) quotaExhausted = true;
      else offers.push(...r);
    }
  }
  for (const o of offers) if (!o.total) o.total = o.pricePerNight * nights;
  return {
    offers: offers.filter((o) => hotelMatches(o, criteria)).sort((a, b) => a.total - b.total),
    quotaExhausted,
  };
}
