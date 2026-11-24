import { exec, execBatch, query } from "./db";
import type { FlightOffer, HotelOffer } from "./types";

/**
 * Histórico de trabajo: todos los precios que ven las búsquedas se guardan para siempre (el más bajo de
 * cada día y fuente), no solo unas horas como la caché. Sirve para:
 *  - saber si un precio es bueno comparándolo con todo lo visto en esa ruta;
 *  - no gastar búsquedas de pago si ya hay un precio en directo reciente para ese mismo viaje.
 */

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();

// Precios consultados al momento a la aerolínea o a Google (los de caché de terceros pueden estar desfasados).
const LIVE = new Set(["ryanair", "google-flights", "combinado"]);

/** Guarda precios de vuelos de ida y vuelta (y los tramos de los combinados, como solo ida). */
export async function recordFares(offers: FlightOffer[]): Promise<void> {
  const day = today();
  const at = now();
  const rows: { sql: string; args: (string | number | null)[] }[] = [];
  const seen = new Set<string>();
  const push = (o: { origin: string; destination: string; depart: string; ret: string; provider: string; price: number; airline?: string; stops?: number; departTime?: string; returnTime?: string; duration?: number; live: boolean; link?: string }) => {
    if (!o.price || o.price <= 0 || o.origin === o.destination) return;
    const k = `${o.origin}|${o.destination}|${o.depart}|${o.ret}|${o.provider}`;
    if (seen.has(k)) return;
    seen.add(k);
    rows.push({
      // Solo se escribe si es nuevo o más barato que lo ya visto hoy (menos escrituras).
      sql: `INSERT INTO fare_obs (origin, destination, depart, ret, provider, day, price, airline, stops, depart_time, return_time, duration, live, link, seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (origin, destination, depart, ret, provider, day) DO UPDATE SET
              price = excluded.price, airline = excluded.airline, stops = excluded.stops, depart_time = excluded.depart_time,
              return_time = excluded.return_time, duration = excluded.duration, live = excluded.live, link = excluded.link, seen_at = excluded.seen_at
            WHERE excluded.price < fare_obs.price`,
      args: [o.origin, o.destination, o.depart, o.ret, o.provider, day, o.price, o.airline ?? null, o.stops ?? null, o.departTime ?? null, o.returnTime ?? null, o.duration ?? null, o.live ? 1 : 0, o.link ?? null, at],
    });
  };
  for (const o of offers) {
    // Sin cribado (precio desconocido) o simulado: no es un precio real.
    if (o.provider === "sin-cribado" || o.provider === "simulado") continue;
    if (o.legs?.length) {
      for (const l of o.legs) {
        push({ origin: l.from, destination: l.to, depart: l.date, ret: "", provider: l.provider, price: l.price, airline: l.airline, stops: l.stops, departTime: l.departTime, live: l.provider === "ryanair", link: l.link });
      }
      continue;
    }
    push({
      origin: o.origin,
      destination: o.destination,
      depart: o.depart,
      ret: o.ret,
      provider: o.provider,
      price: o.price,
      airline: o.airline,
      stops: o.stops,
      departTime: o.departTime,
      returnTime: o.returnTime,
      duration: o.durationMinutes,
      live: LIVE.has(o.provider) && !o.cached,
      link: o.link,
    });
  }
  await execBatch(rows).catch((err) => console.error("fare_obs", err));
}

/** Guarda precios de alojamiento (por noche) de una búsqueda. */
export async function recordHotels(offers: HotelOffer[], ctx: { city: string; checkIn: string; nights: number; guests: number }): Promise<void> {
  const day = today();
  const at = now();
  const rows = offers
    .filter((h) => h.pricePerNight > 0 && h.provider !== "simulado")
    .map((h) => ({
      sql: `INSERT INTO hotel_obs (hotel_key, check_in, nights, guests, day, name, city, lat, lon, price_per_night, source, rating, seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (hotel_key, check_in, nights, guests, day) DO UPDATE SET
              price_per_night = excluded.price_per_night, source = excluded.source, rating = excluded.rating, seen_at = excluded.seen_at
            WHERE excluded.price_per_night < hotel_obs.price_per_night`,
      args: [
        h.reviewsLink ?? `${h.name}|${ctx.city}`,
        ctx.checkIn,
        ctx.nights,
        ctx.guests,
        day,
        h.name,
        ctx.city,
        h.lat ?? null,
        h.lon ?? null,
        h.pricePerNight,
        h.bookingLinks?.[0]?.label ?? h.provider,
        h.rating ?? null,
        at,
      ],
    }));
  await execBatch(rows).catch((err) => console.error("hotel_obs", err));
}

type FareRow = { price: number; airline: string | null; stops: number | null; depart_time: string | null; return_time: string | null; duration: number | null; link: string | null; provider: string; seen_at: string };

/**
 * Precio en directo ya consultado para este mismo viaje hace poco: así no se gasta otra búsqueda de pago.
 * Devuelve la oferta tal cual se vio (con su enlace), o null.
 */
export async function recentLiveFare(
  origin: string,
  destination: string,
  depart: string,
  ret: string,
  maxAgeHours: number,
  providers = ["google-flights"],
): Promise<FlightOffer | null> {
  const since = new Date(Date.now() - maxAgeHours * 3600_000).toISOString();
  const [r] = await query<FareRow>(
    `SELECT price, airline, stops, depart_time, return_time, duration, link, provider, seen_at FROM fare_obs
     WHERE origin = ? AND destination = ? AND depart = ? AND ret = ? AND live = 1 AND seen_at >= ?
       AND provider IN (${providers.map(() => "?").join(",")})
     ORDER BY seen_at DESC LIMIT 1`,
    [origin, destination, depart, ret, since, ...providers],
  ).catch(() => []);
  if (!r) return null;
  return {
    provider: r.provider,
    cached: false,
    origin,
    destination,
    depart,
    ret,
    price: Number(r.price),
    stops: Number(r.stops ?? 0),
    airline: r.airline ?? undefined,
    departTime: r.depart_time ?? undefined,
    returnTime: r.return_time ?? undefined,
    durationMinutes: r.duration ? Number(r.duration) : undefined,
    link: r.link ?? undefined,
  };
}

export type RouteStats = {
  // Precios distintos guardados (un precio por viaje, fuente y día) y días en los que se han visto.
  samples: number;
  days: number;
  since: string;
  min: number;
  p25: number;
  median: number;
  // Fecha de ida del más barato visto.
  minDepart: string;
};

/**
 * Lo visto en una ruta para viajes parecidos (mismos meses de ida y noches), en los últimos `days` días.
 * Precio por persona, ida y vuelta.
 */
export async function routeStats(
  origins: string[],
  destinations: string[],
  opts: { months: string[]; minNights: number; maxNights: number; maxStops: number; days?: number },
): Promise<RouteStats | null> {
  if (!origins.length || !destinations.length || !opts.months.length) return null;
  const since = new Date(Date.now() - (opts.days ?? 365) * 86_400_000).toISOString().slice(0, 10);
  const rows = await query<{ price: number; depart: string; day: string }>(
    `SELECT price, depart, day FROM fare_obs
     WHERE origin IN (${origins.map(() => "?").join(",")}) AND destination IN (${destinations.map(() => "?").join(",")})
       AND ret <> '' AND substr(depart, 1, 7) IN (${opts.months.map(() => "?").join(",")})
       AND julianday(ret) - julianday(depart) BETWEEN ? AND ?
       AND (stops IS NULL OR stops <= ?) AND day >= ?`,
    [...origins, ...destinations, ...opts.months, opts.minNights, opts.maxNights, opts.maxStops, since],
  ).catch(() => []);
  if (rows.length < 3) return null;
  const prices = rows.map((r) => Number(r.price)).sort((a, b) => a - b);
  const q = (p: number) => prices[Math.min(prices.length - 1, Math.floor(p * (prices.length - 1)))];
  const cheapest = rows.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
  const days = new Set(rows.map((r) => r.day));
  return {
    samples: rows.length,
    days: days.size,
    since: [...days].sort()[0],
    min: prices[0],
    p25: q(0.25),
    median: q(0.5),
    minDepart: cheapest.depart,
  };
}

/** Proporción de precios guardados (viajes parecidos, último año) que entran en un presupuesto (0–1). */
export async function budgetShare(
  origins: string[],
  destinations: string[],
  opts: { months: string[]; minNights: number; maxNights: number; maxStops: number },
  budget: number,
): Promise<number | null> {
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const [r] = await query<{ within: number; total: number }>(
    `SELECT SUM(CASE WHEN price <= ? THEN 1 ELSE 0 END) AS within, COUNT(*) AS total FROM fare_obs
     WHERE origin IN (${origins.map(() => "?").join(",")}) AND destination IN (${destinations.map(() => "?").join(",")})
       AND ret <> '' AND substr(depart, 1, 7) IN (${opts.months.map(() => "?").join(",")})
       AND julianday(ret) - julianday(depart) BETWEEN ? AND ?
       AND (stops IS NULL OR stops <= ?) AND day >= ?`,
    [budget, ...origins, ...destinations, ...opts.months, opts.minNights, opts.maxNights, opts.maxStops, since],
  ).catch(() => []);
  return r && Number(r.total) ? Number(r.within) / Number(r.total) : null;
}

/** Qué tal es un precio frente a lo visto: proporción de precios guardados que eran más caros (0–1). */
export async function cheaperThanShare(stats: RouteStats | null, price: number, origins: string[], destinations: string[], months: string[]): Promise<number | null> {
  if (!stats) return null;
  const [r] = await query<{ above: number; total: number }>(
    `SELECT SUM(CASE WHEN price > ? THEN 1 ELSE 0 END) AS above, COUNT(*) AS total FROM fare_obs
     WHERE origin IN (${origins.map(() => "?").join(",")}) AND destination IN (${destinations.map(() => "?").join(",")})
       AND ret <> '' AND substr(depart, 1, 7) IN (${months.map(() => "?").join(",")}) AND day >= ?`,
    [price, ...origins, ...destinations, ...months, stats.since],
  ).catch(() => []);
  return r && Number(r.total) ? Number(r.above) / Number(r.total) : null;
}

/** Tamaño del histórico (para Ajustes). */
export async function observationCounts(): Promise<{ fares: number; hotels: number; routes: number; since: string | null }> {
  const [f] = await query<{ n: number; routes: number; since: string | null }>(
    "SELECT COUNT(*) AS n, COUNT(DISTINCT origin || destination) AS routes, MIN(day) AS since FROM fare_obs",
  ).catch(() => []);
  const [h] = await query<{ n: number }>("SELECT COUNT(*) AS n FROM hotel_obs").catch(() => []);
  return { fares: Number(f?.n ?? 0), hotels: Number(h?.n ?? 0), routes: Number(f?.routes ?? 0), since: f?.since ?? null };
}

/** Borra lo de hace más de ~2 años (para que la base no crezca sin fin). */
export async function pruneObservations(keepDays = 730): Promise<void> {
  const cutoff = new Date(Date.now() - keepDays * 86_400_000).toISOString().slice(0, 10);
  await exec("DELETE FROM fare_obs WHERE day < ?", [cutoff]).catch(() => 0);
  await exec("DELETE FROM hotel_obs WHERE day < ?", [cutoff]).catch(() => 0);
}
