import { cached, peekCache } from "../db";
import { getAirport, haversineKm } from "../geo";
import { recentLiveFare } from "../observations";
import { take } from "../quota";
import type { FlightOffer } from "../types";
import { ALLOW_MOCK, hash, timeBucket } from "./mock";

import { ryanairDayTrips, ryanairFares, ryanairWindows } from "./ryanair";

/**
 * Embudo de vuelos:
 *  - screen(): cribado barato con precios en caché (Travelpayouts/Aviasales Data API, gratis para afiliados)
 *    + tarifas reales de Ryanair (gratis, sin cupo).
 *  - confirm(): primero Ryanair (gratis); SerpApi Google Flights (250 búsquedas/mes) solo como último recurso.
 * Sin claves, lo que no cubre Ryanair usa datos simulados.
 */

const TP_TOKEN = process.env.TRAVELPAYOUTS_TOKEN;
const SERPAPI_KEY = process.env.SERPAPI_KEY;

// "ryanair": sin claves y sin datos simulados, solo hay precios reales de Ryanair.
export const flightProviders = {
  screen: TP_TOKEN ? "travelpayouts" : SERPAPI_KEY ? "none" : ALLOW_MOCK ? "mock" : "ryanair",
  confirm: SERPAPI_KEY ? "serpapi" : TP_TOKEN ? "cached" : ALLOW_MOCK ? "mock" : "ryanair",
} as const;

type TPItem = {
  origin: string;
  destination: string;
  origin_airport: string;
  destination_airport: string;
  price: number;
  airline: string;
  departure_at: string;
  return_at?: string;
  transfers: number;
  return_transfers?: number;
  duration?: number;
  // Duración de la ida (duration es la de ida y vuelta juntas).
  duration_to?: number;
  link: string;
};

async function screenTravelpayouts(origin: string, destination: string | null, month: string): Promise<FlightOffer[]> {
  const params = new URLSearchParams({
    origin,
    departure_at: month,
    return_at: month,
    one_way: "false",
    direct: "false",
    sorting: "price",
    unique: destination ? "false" : "true",
    currency: "eur",
    limit: "1000",
    token: TP_TOKEN!,
  });
  if (destination) params.set("destination", destination);
  return cached(`tp:${origin}:${destination ?? "*"}:${month}`, 3 * 3600, async () => {
    const res = await fetch(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${params}`);
    if (!res.ok) throw new Error(`Travelpayouts ${res.status}`);
    const json = (await res.json()) as { success: boolean; data: TPItem[] };
    return json.data
      .filter((d) => d.return_at)
      .map((d) => ({
        provider: "travelpayouts",
        cached: true,
        origin: d.origin_airport || d.origin,
        destination: d.destination_airport || d.destination,
        depart: d.departure_at.slice(0, 10),
        ret: d.return_at!.slice(0, 10),
        price: d.price,
        stops: Math.max(d.transfers, d.return_transfers ?? 0),
        durationMinutes: d.duration_to ?? d.duration,
        airline: d.airline,
        departTime: d.departure_at.slice(11, 16),
        returnTime: d.return_at!.slice(11, 16),
        link: `https://www.aviasales.com${d.link}`,
      }));
  });
}

/**
 * Precios de ida y vuelta de una ruta en un mes (caché de Aviasales, gratis; vacío sin Travelpayouts).
 * Lo usa el formulario para enseñar el histórico de una ruta nueva antes de crear la alerta.
 */
export async function marketFares(origin: string, destination: string, month: string): Promise<FlightOffer[]> {
  if (!TP_TOKEN) return [];
  return screenTravelpayouts(origin, destination, month).catch(() => []);
}

type TPGrouped = { success: boolean; data?: Record<string, { price: number }> };

async function cheapestByMonth(origin: string, destination: string): Promise<Record<string, number>> {
  const params = new URLSearchParams({ origin, destination, currency: "eur", group_by: "month", token: TP_TOKEN! });
  return cached(`tp:month:${origin}:${destination}`, 12 * 3600, async () => {
    const res = await fetch(`https://api.travelpayouts.com/aviasales/v3/grouped_prices?${params}`);
    if (!res.ok) throw new Error(`Travelpayouts ${res.status}`);
    const json = (await res.json()) as TPGrouped;
    return Object.fromEntries(Object.entries(json.data ?? {}).map(([m, v]) => [m, v.price]));
  });
}

/**
 * Lo más barato de cada mes de los próximos 12 para una ruta: ida más barata + vuelta más barata del mes
 * (estimación de ida y vuelta, por persona). Vacío sin Travelpayouts.
 */
export async function monthlyTrend(origin: string, destination: string): Promise<Record<string, number>> {
  if (!TP_TOKEN) return {};
  const [out, back] = await Promise.all([cheapestByMonth(origin, destination), cheapestByMonth(destination, origin)]);
  const months: Record<string, number> = {};
  for (const [m, p] of Object.entries(out)) if (back[m]) months[m] = Math.round(p + back[m]);
  return months;
}

function mockPrice(origin: string, destination: string, depart: string, ret: string): number {
  const a = getAirport(origin);
  const b = getAirport(destination);
  const km = a && b ? haversineKm(a.lat, a.lon, b.lat, b.lon) : 1200;
  const base = 35 + km * 0.09;
  const factor = 0.55 + hash(`${origin}${destination}${depart}${ret}${timeBucket()}`) * 1.1;
  return Math.round(base * factor);
}

function mockOffer(origin: string, destination: string, depart: string, ret: string, cachedData: boolean): FlightOffer {
  const a = getAirport(origin);
  const b = getAirport(destination);
  const km = a && b ? haversineKm(a.lat, a.lon, b.lat, b.lon) : 1200;
  const h = hash(`${origin}${destination}${depart}`);
  const stops = km < 1500 ? (h < 0.7 ? 0 : 1) : h < 0.4 ? 0 : h < 0.85 ? 1 : 2;
  const hour = 6 + Math.floor(h * 15);
  const durationMinutes = Math.round(km / 12 + 40 + stops * 95);
  return {
    provider: "simulado",
    cached: cachedData,
    origin,
    destination,
    depart,
    ret,
    price: mockPrice(origin, destination, depart, ret),
    stops,
    durationMinutes,
    airline: ["Vueling", "Ryanair", "Iberia", "Air France", "easyJet", "TAP", "LOT"][Math.floor(h * 7)],
    departTime: `${String(hour).padStart(2, "0")}:${h > 0.5 ? "35" : "05"}`,
    link: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${origin} to ${destination} on ${depart} through ${ret}`)}`,
  };
}

const RYANAIR_EXTRA = new Set(["MA", "JO", "IL", "EG", "TN", "DZ"]);
function ryanairArea(code: string): boolean {
  const a = getAirport(code);
  return !a || a.region === "europe" || RYANAIR_EXTRA.has(a.country);
}

export async function screen(
  origin: string,
  destination: string | null,
  month: string,
  windows: { depart: string; ret: string }[],
  anywhereCandidates: string[] = [],
  adults = 1,
): Promise<FlightOffer[]> {
  const inMonth = windows.filter((w) => w.depart.startsWith(month));
  // Ryanair solo vuela en Europa y alrededores: fuera de ahí no se le pregunta.
  const ryrOk = ryanairArea(origin) && (!destination || ryanairArea(destination));
  // Viajes de un día (ida y vuelta la misma fecha): se buscan con dos vuelos de solo ida.
  const sameDay = inMonth.filter((w) => w.depart === w.ret).map((w) => w.depart);
  const multiDay = inMonth.filter((w) => w.depart !== w.ret);
  const ryanair = ryrOk
    ? [
        ...(multiDay.length ? await ryanairWindows(origin, destination, multiDay, adults) : []),
        ...(sameDay.length ? await ryanairDayTrips(origin, destination, sameDay, adults) : []),
      ]
    : [];
  if (flightProviders.screen === "travelpayouts") {
    return [...ryanair, ...(await screenTravelpayouts(origin, destination, month))];
  }
  if (flightProviders.screen === "ryanair") return ryanair;
  // Sin Travelpayouts, los destinos que ya tienen tarifas reales de Ryanair no se rellenan.
  const covered = new Set(ryanair.map((o) => o.destination));
  const dests = (destination ? [destination] : anywhereCandidates).filter((d) => !covered.has(d));
  if (flightProviders.screen === "none") {
    // Sin cribado: todas las fechas pasan a confirmación (precio desconocido = 0 para ordenar por fecha).
    return [
      ...ryanair,
      ...dests.flatMap((d) => inMonth.map((w) => ({ ...mockOffer(origin, d, w.depart, w.ret, true), provider: "sin-cribado", price: 0 }))),
    ];
  }
  return [...ryanair, ...dests.flatMap((d) => inMonth.map((w) => mockOffer(origin, d, w.depart, w.ret, true)))];
}

type SerpFlight = {
  flights: { departure_airport: { id: string; time: string }; arrival_airport: { id: string; time: string }; airline: string }[];
  layovers?: unknown[];
  total_duration?: number;
  price?: number;
};

/**
 * paid: se gastó una búsqueda del cupo. skipped: hacía falta una búsqueda de pago y no se permitió.
 */
export type ConfirmResult = { offer: FlightOffer | null; paid?: boolean; skipped?: boolean; quotaExhausted?: boolean };

// Si Ryanair está como mucho un 5 % por encima del precio cribado, se da por buena sin gastar cupo.
const RYANAIR_TOLERANCE = 1.05;

export async function confirm(
  candidate: FlightOffer,
  opts: { maxStops: number; passengers: number; allowPaid: boolean },
): Promise<ConfirmResult> {
  const { origin, destination, depart, ret } = candidate;

  // 1) Gratis: tarifa real de Ryanair para esas fechas (normalmente ya en caché desde el cribado).
  // Viaje de un día de Ryanair: ya es precio real (dos vuelos de solo ida consultados al momento).
  if (candidate.provider === "ryanair" && depart === ret) return { offer: candidate };
  const ryrArea = ryanairArea(origin) && ryanairArea(destination);
  const ryr = (ryrArea ? await ryanairFares(origin, destination, depart, ret, opts.passengers).catch(() => []) : []).find(
    (o) => o.destination === destination,
  );
  if (candidate.provider === "ryanair") return { offer: ryr ?? null };
  if (ryr && ryr.price <= candidate.price * RYANAIR_TOLERANCE) return { offer: ryr };

  if (flightProviders.confirm === "cached") return { offer: candidate };
  if (flightProviders.confirm === "ryanair") return { offer: null };
  if (flightProviders.confirm === "mock") {
    // La búsqueda "en vivo" simulada puede variar un poco respecto al precio en caché.
    const live = mockOffer(origin, destination, depart, ret, false);
    live.price = Math.round(candidate.price * (0.92 + hash(`${depart}${ret}live${timeBucket()}`) * 0.2));
    return { offer: live };
  }

  const key = `serp:f:${origin}:${destination}:${depart}:${ret}:${opts.maxStops}:${opts.passengers}`;
  const existing = await peekCache<FlightOffer | null>(key);
  if (existing !== undefined) return { offer: existing };
  // 2) Último recurso, con cupo: Google Flights vía SerpApi.
  // Histórico: si este mismo viaje ya se consultó en directo hace poco (en esta u otra alerta), se reutiliza.
  const recent = await recentLiveFare(origin, destination, depart, ret, 12);
  if (recent && recent.stops <= opts.maxStops) return { offer: recent };
  if (!opts.allowPaid) return { offer: null, skipped: true };
  if (!(await take("serpapi"))) return { offer: null, quotaExhausted: true };

  return {
    paid: true,
    offer: await cached(key, 4 * 3600, async () => {
      const params = new URLSearchParams({
        engine: "google_flights",
        departure_id: origin,
        arrival_id: destination,
        outbound_date: depart,
        return_date: ret,
        type: "1",
        currency: "EUR",
        hl: "es",
        gl: "es",
        adults: String(opts.passengers),
        stops: String(opts.maxStops + 1), // 1 = directo, 2 = 1 escala o menos, 3 = 2 o menos
        api_key: SERPAPI_KEY!,
      });
      const res = await fetch(`https://serpapi.com/search.json?${params}`);
      if (!res.ok) throw new Error(`SerpApi ${res.status}`);
      const json = (await res.json()) as {
        best_flights?: SerpFlight[];
        other_flights?: SerpFlight[];
        search_metadata?: { google_flights_url?: string };
      };
      const all = [...(json.best_flights ?? []), ...(json.other_flights ?? [])].filter((f) => f.price);
      all.sort((a, b) => a.price! - b.price!);
      const best = all[0];
      if (!best) return null;
      const first = best.flights[0];
      const last = best.flights[best.flights.length - 1];
      return {
        provider: "google-flights",
        cached: false,
        origin,
        destination,
        depart,
        ret,
        price: Math.round(best.price! / opts.passengers), // siempre por persona
        stops: best.flights.length - 1,
        durationMinutes: best.total_duration,
        airline: [...new Set(best.flights.map((f) => f.airline))].join(" + "),
        departTime: first.departure_airport.time.slice(11, 16),
        arriveTime: last.arrival_airport.time.slice(11, 16),
        link: json.search_metadata?.google_flights_url,
      } satisfies FlightOffer;
    }),
  };
}
