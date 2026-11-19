import { cached } from "../db";
import { getAirport, haversineKm } from "../geo";
import type { FlightLeg, FlightOffer } from "../types";

/**
 * Vuelos combinados ("escala por tu cuenta"): dos billetes de solo ida encadenados en otra ciudad,
 * p. ej. Barcelona → Bérgamo → Rovaniemi, cuando sale más barato que el vuelo de ida y vuelta normal.
 *  - Ryanair: precio real de cada día y horarios, y su mapa de rutas para saber por dónde se puede enlazar.
 *  - Travelpayouts: el resto de aerolíneas (Norwegian, easyJet, Vueling, Wizz, Finnair, SAS…), precios en caché.
 * La ida y la vuelta se eligen por separado: pueden ir por ciudades distintas, o una de ellas ser directa.
 */

const TP_TOKEN = process.env.TRAVELPAYOUTS_TOKEN;

// Margen mínimo entre aterrizar y el siguiente despegue: con billetes separados nadie espera si hay retraso.
const MIN_CONNECTION_MIN = 150;
// Con horas de otras fuentes (sin hora de llegada exacta ni husos horarios) se deja más margen.
const MIN_CONNECTION_ESTIMATED_MIN = 210;
// Se admite dormir en la ciudad del enlace (salir la tarde anterior y seguir por la mañana).
const MAX_CONNECTION_MIN = 20 * 60;
// Para salir la víspera, el primer vuelo tiene que ser por la tarde (después del trabajo).
const EVENING_FROM = "16:00";
const MAX_HUBS = 8;

// Aeropuertos grandes y bases de low cost por donde suele compensar enlazar en Europa.
const HUBS = [
  "BGY", "MXP", "STN", "LTN", "LGW", "CRL", "BRU", "AMS", "EIN", "BER", "CPH", "OSL", "ARN", "HEL", "FRA",
  "MUC", "VIE", "WAW", "WMI", "KRK", "BUD", "DUB", "FCO", "CIA", "BVA", "ORY", "CDG", "ZRH", "GVA", "LIS",
  "MAD", "RIX", "TLL", "PRG", "BLQ", "VCE", "NAP", "OPO", "AGP", "PMI", "GDN", "VNO", "BTS", "MLA", "ATH",
];

type Day = Map<string, FlightLeg[]>; // fecha → tramos de ese día

function km(a: string, b: string): number | null {
  const x = getAirport(a);
  const y = getAirport(b);
  return x && y ? haversineKm(x.lat, x.lon, y.lat, y.lon) : null;
}

/** Cuánto se alarga el camino pasando por el hub (1 = en línea recta). null si no tiene sentido. */
function detour(o: string, h: string, d: string): number | null {
  const oh = km(o, h);
  const hd = km(h, d);
  const od = km(o, d);
  if (oh === null || hd === null || od === null || od < 300) return null;
  if (oh < 150 || hd < 150) return null; // el hub no puede estar al lado de casa ni del destino
  return (oh + hd) / od;
}

function ryanairLink(o: string, d: string, date: string, adults: number) {
  const p = new URLSearchParams({ adults: String(adults), dateOut: date, originIata: o, destinationIata: d, isReturn: "false" });
  return `https://www.ryanair.com/es/es/trip/flights/select?${p}`;
}

/** Destinos de Ryanair desde un aeropuerto (su buscador público). */
async function ryanairRoutes(code: string): Promise<string[]> {
  return cached(`ryr:routes:${code}`, 7 * 86400, async () => {
    const res = await fetch(`https://www.ryanair.com/api/views/locate/searchWidget/routes/es/airport/${code}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { arrivalAirport?: { code?: string } }[];
    return Array.isArray(json) ? json.map((r) => r.arrivalAirport?.code).filter((c): c is string => !!c) : [];
  }).catch(() => []);
}

type RyrDay = { day: string; departureDate?: string; arrivalDate?: string; price?: { value: number } | null; unavailable?: boolean; soldOut?: boolean };

/** Precio de Ryanair de solo ida para cada día del mes, con horarios (hora local de cada aeropuerto). */
async function ryanairDaily(o: string, d: string, month: string, adults: number): Promise<FlightLeg[]> {
  return cached(`ryr:ow:${o}:${d}:${month}:${adults}`, 3 * 3600, async () => {
    const url = `https://services-api.ryanair.com/farfnd/v4/oneWayFares/${o}/${d}/cheapestPerDay?outboundMonthOfDate=${month}-01&currency=EUR&adultPaxCount=${adults}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { outbound?: { fares?: RyrDay[] } };
    return (json.outbound?.fares ?? [])
      .filter((f) => f.price?.value && f.departureDate && !f.unavailable && !f.soldOut)
      .map(
        (f): FlightLeg => ({
          provider: "ryanair",
          airline: "Ryanair",
          from: o,
          to: d,
          date: f.day,
          departTime: f.departureDate!.slice(11, 16),
          arriveTime: f.arrivalDate?.slice(11, 16),
          arriveDate: f.arrivalDate?.slice(0, 10),
          price: Math.round(f.price!.value * 100) / 100,
          stops: 0,
          link: ryanairLink(o, d, f.day, adults),
        }),
      );
  }).catch(() => []);
}

type RyrFare = { outbound: { departureDate: string; arrivalDate: string; price: { value: number } } };

/** El vuelo de Ryanair más barato de un día dentro de una franja horaria (para que el enlace cuadre). */
async function ryanairBand(o: string, d: string, day: string, from: string, to: string, adults: number): Promise<FlightLeg | null> {
  return cached(`ryr:band:${o}:${d}:${day}:${from}:${to}:${adults}`, 3 * 3600, async () => {
    const p = new URLSearchParams({
      departureAirportIataCode: o,
      arrivalAirportIataCode: d,
      outboundDepartureDateFrom: day,
      outboundDepartureDateTo: day,
      outboundDepartureTimeFrom: from,
      outboundDepartureTimeTo: to,
      adultPaxCount: String(adults),
      currency: "EUR",
      market: "es-es",
    });
    const res = await fetch(`https://services-api.ryanair.com/farfnd/v4/oneWayFares?${p}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const f = ((await res.json()) as { fares?: RyrFare[] }).fares?.[0]?.outbound;
    if (!f?.price?.value) return null;
    return {
      provider: "ryanair",
      airline: "Ryanair",
      from: o,
      to: d,
      date: f.departureDate.slice(0, 10),
      departTime: f.departureDate.slice(11, 16),
      arriveTime: f.arrivalDate.slice(11, 16),
      arriveDate: f.arrivalDate.slice(0, 10),
      price: Math.round(f.price.value * 100) / 100,
      stops: 0,
      link: ryanairLink(o, d, day, adults),
    } satisfies FlightLeg;
  }).catch(() => null);
}

type TPItem = { departure_at: string; price: number; airline: string; transfers: number; duration_to?: number; duration?: number; link: string };

/** Solo ida del resto de aerolíneas (precios en caché de Aviasales). */
async function tpDaily(o: string, d: string, month: string): Promise<FlightLeg[]> {
  if (!TP_TOKEN) return [];
  return cached(`tp:ow:${o}:${d}:${month}`, 3 * 3600, async () => {
    const p = new URLSearchParams({
      origin: o,
      destination: d,
      departure_at: month,
      one_way: "true",
      direct: "false",
      sorting: "price",
      unique: "false",
      currency: "eur",
      limit: "200",
      token: TP_TOKEN,
    });
    const res = await fetch(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${p}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: TPItem[] };
    return (json.data ?? []).map((x): FlightLeg => {
      const dur = x.duration_to ?? x.duration;
      // Llegada aproximada: salida + duración (sin corregir el cambio de huso horario).
      const arr = dur ? new Date(Date.parse(x.departure_at.slice(0, 16) + "Z") + dur * 60_000).toISOString() : undefined;
      return {
        provider: "travelpayouts",
        airline: x.airline,
        from: o,
        to: d,
        date: x.departure_at.slice(0, 10),
        departTime: x.departure_at.slice(11, 16),
        arriveTime: arr?.slice(11, 16),
        arriveDate: arr?.slice(0, 10),
        estimated: true,
        price: x.price,
        stops: x.transfers,
        link: `https://www.aviasales.com${x.link}`,
      };
    });
  }).catch(() => []);
}

async function legs(o: string, d: string, months: string[], adults: number, useRyanair: boolean): Promise<Day> {
  const all = (
    await Promise.all(months.flatMap((m) => [useRyanair ? ryanairDaily(o, d, m, adults) : Promise.resolve([]), tpDaily(o, d, m)]))
  ).flat();
  const byDay: Day = new Map();
  for (const l of all) byDay.set(l.date, [...(byDay.get(l.date) ?? []), l]);
  for (const ls of byDay.values()) ls.sort((a, b) => a.price - b.price);
  return byDay;
}

function prevDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

const toMin = (date: string, time: string) => Date.parse(`${date}T${time}:00Z`) / 60_000;

/** Hora "HH:MM" desplazada en minutos, sin salir del día (null si se sale). */
function shift(time: string, delta: number): string | null {
  const [h, m] = time.split(":").map(Number);
  const t = h * 60 + m + delta;
  if (t < 0 || t > 23 * 60 + 59) return null;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Duración típica de una ruta según los horarios conocidos (minutos). */
function typicalDuration(day: Day): number {
  for (const ls of day.values()) {
    const l = ls.find((x) => !x.estimated && x.arriveTime);
    if (l) return Math.max(40, toMin(l.arriveDate ?? l.date, l.arriveTime!) - toMin(l.date, l.departTime));
  }
  return 150;
}

// Consultas extra por franja horaria que se permiten en cada búsqueda.
const MAX_BAND_QUERIES = 80;

/** Mejor pareja de tramos que enlaza el mismo día con margen suficiente. */
function bestPair(first: FlightLeg[], second: FlightLeg[], maxStops: number): [FlightLeg, FlightLeg] | null {
  let best: [FlightLeg, FlightLeg] | null = null;
  for (const a of first.slice(0, 8)) {
    if (a.stops > maxStops || !a.arriveTime) continue;
    for (const b of second.slice(0, 6)) {
      if (b.stops > maxStops) continue;
      const gap = toMin(b.date, b.departTime) - toMin(a.arriveDate ?? a.date, a.arriveTime);
      const min = a.estimated || b.estimated ? MIN_CONNECTION_ESTIMATED_MIN : MIN_CONNECTION_MIN;
      if (gap < min || gap > MAX_CONNECTION_MIN) continue;
      if (!best || a.price + b.price < best[0].price + best[1].price) best = [a, b];
    }
  }
  return best;
}

export type ComboSearch = {
  origins: string[];
  destinations: string[];
  windows: { depart: string; ret: string }[];
  adults: number;
  maxStops: number;
  // Precio máximo por persona (ida y vuelta): no se afinan enlaces que no pueden bajar de ahí.
  maxPrice: number;
};

/** Combinaciones más baratas por fecha y destino. Cada una es una oferta de ida y vuelta con sus tramos. */
export async function findCombos(s: ComboSearch): Promise<FlightOffer[]> {
  const months = [...new Set(s.windows.flatMap((w) => [w.depart.slice(0, 7), w.ret.slice(0, 7)]))];
  const offers: FlightOffer[] = [];
  let bandQueries = 0;
  const band = (o: string, d: string, day: string, from: string, to: string) => {
    if (bandQueries >= MAX_BAND_QUERIES) return Promise.resolve(null);
    bandQueries++;
    return ryanairBand(o, d, day, from, to, s.adults);
  };

  for (const o of s.origins) {
    for (const d of s.destinations.slice(0, 2)) {
      if (o === d) continue;
      const [fromO, fromD] = await Promise.all([ryanairRoutes(o), ryanairRoutes(d)]);
      const ryrHubs = new Set(fromO.filter((h) => fromD.includes(h)));
      const ranked = [...new Set([...ryrHubs, ...HUBS])]
        .map((h) => ({ h, r: detour(o, h, d) }))
        .filter((x): x is { h: string; r: number } => x.r !== null && x.r <= (ryrHubs.has(x.h) ? 1.8 : 1.5))
        // Primero los que Ryanair conecta por los dos lados (precios reales), luego los más en línea recta.
        .sort((a, b) => Number(ryrHubs.has(b.h)) - Number(ryrHubs.has(a.h)) || a.r - b.r)
        .slice(0, MAX_HUBS);
      if (!ranked.length) continue;

      // Directo de solo ida, para combinar: p. ej. ida por Bérgamo y vuelta directa.
      const direct = { out: await legs(o, d, months, s.adults, fromO.includes(d)), back: await legs(d, o, months, s.adults, fromD.includes(o)) };
      const hubLegs = await Promise.all(
        ranked.map(async ({ h }) => {
          const ryr = ryrHubs.has(h);
          const [a, b, c, e] = await Promise.all([
            legs(o, h, months, s.adults, ryr),
            legs(h, d, months, s.adults, ryr),
            legs(d, h, months, s.adults, ryr),
            legs(h, o, months, s.adults, ryr),
          ]);
          return { h, ryr, oh: a, hd: b, dh: c, ho: e };
        }),
      );

      for (const w of s.windows) {
        type Side = { legs: FlightLeg[]; price: number; via?: string };
        const pick = (direct: FlightLeg[] | undefined, pairs: (Side | null)[]): Side | null => {
          const opts: Side[] = pairs.filter((p): p is Side => !!p);
          const dl = direct?.find((l) => l.stops <= s.maxStops);
          if (dl) opts.push({ legs: [dl], price: dl.price });
          return opts.sort((a, b) => a.price - b.price)[0] ?? null;
        };
        const eve = prevDay(w.depart);
        const cap = s.maxPrice * 1.15;
        const out = pick(
          direct.out.get(w.depart),
          await Promise.all(
            hubLegs.map(async (x) => {
              const first = [...(x.oh.get(eve) ?? []).filter((l) => l.departTime >= EVENING_FROM), ...(x.oh.get(w.depart) ?? [])];
              const second = x.hd.get(w.depart) ?? [];
              let p = bestPair(first.sort((a, b) => a.price - b.price), second, s.maxStops);
              // El más barato del día no enlaza: se pide a Ryanair el vuelo de la franja que sí cuadra.
              const floor = Math.min(Infinity, ...first.map((l) => l.price));
              if (!p && x.ryr && second.length && Math.min(floor, 60) + second[0].price <= cap) {
                const dur = typicalDuration(x.oh);
                for (const b of second.filter((l) => !l.estimated).slice(0, 2)) {
                  const latest = shift(b.departTime, -(MIN_CONNECTION_MIN + dur));
                  const extra = await Promise.all([
                    latest && latest >= "05:00" ? band(o, x.h, w.depart, "00:00", latest) : null,
                    band(o, x.h, eve, EVENING_FROM, "23:59"),
                  ]);
                  first.push(...extra.filter((l): l is FlightLeg => !!l));
                }
                p = bestPair(first.sort((a, b) => a.price - b.price), second, s.maxStops);
              }
              return p ? { legs: p, price: p[0].price + p[1].price, via: x.h } : null;
            }),
          ),
        );
        const back = pick(
          direct.back.get(w.ret),
          await Promise.all(
            hubLegs.map(async (x) => {
              const first = x.dh.get(w.ret) ?? [];
              const second = [...(x.ho.get(w.ret) ?? [])];
              let p = bestPair(first, second, s.maxStops);
              const floor = Math.min(Infinity, ...second.map((l) => l.price));
              if (!p && x.ryr && first.length && Math.min(floor, 60) + first[0].price <= cap) {
                for (const a of first.filter((l) => !l.estimated && l.arriveTime && (l.arriveDate ?? l.date) === w.ret).slice(0, 2)) {
                  const earliest = shift(a.arriveTime!, MIN_CONNECTION_MIN);
                  const l = earliest ? await band(x.h, o, w.ret, earliest, "23:59") : null;
                  if (l) second.push(l);
                }
                p = bestPair(first, second.sort((a, b) => a.price - b.price), s.maxStops);
              }
              return p ? { legs: p, price: p[0].price + p[1].price, via: x.h } : null;
            }),
          ),
        );
        // Solo cuenta como combinado si al menos un lado enlaza por otra ciudad.
        if (!out || !back || (!out.via && !back.via)) continue;
        const all = [...out.legs, ...back.legs];
        const via = [...new Set([out.via, back.via].filter((v): v is string => !!v))];
        offers.push({
          provider: "combinado",
          cached: all.some((l) => l.estimated),
          origin: o,
          destination: d,
          depart: w.depart,
          ret: w.ret,
          price: Math.round(out.price + back.price),
          stops: Math.max(out.legs.length, back.legs.length) - 1 + Math.max(...all.map((l) => l.stops)),
          airline: [...new Set(all.map((l) => l.airline))].join(" + "),
          departTime: out.legs[0].departTime,
          arriveTime: out.legs.at(-1)!.arriveTime,
          link: out.legs[0].link,
          legs: all,
          via,
        });
      }
    }
  }
  return offers;
}
