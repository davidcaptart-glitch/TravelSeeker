import { cached } from "../db";
import type { FlightOffer } from "../types";

/**
 * Ryanair: la misma API pública que usa su buscador de tarifas (sin clave ni cupo).
 * Solo vuelos directos de Ryanair; precio por persona, ida y vuelta.
 * No es oficial: si cambia, devuelve [] y el embudo sigue con las demás fuentes.
 */

type RyrLeg = {
  departureAirport: { iataCode: string };
  arrivalAirport: { iataCode: string };
  departureDate: string;
  arrivalDate: string;
  price: { value: number };
};
type RyrFare = { outbound: RyrLeg; inbound: RyrLeg; summary: { price: { value: number } } };

const BASE = "https://services-api.ryanair.com/farfnd/v4/roundTripFares";

function bookingLink(o: string, d: string, depart: string, ret: string, adults: number) {
  const p = new URLSearchParams({
    adults: String(adults),
    dateOut: depart,
    dateIn: ret,
    originIata: o,
    destinationIata: d,
    isReturn: "true",
  });
  return `https://www.ryanair.com/es/es/trip/flights/select?${p}`;
}

function toOffer(f: RyrFare, adults: number): FlightOffer {
  const out = f.outbound;
  const back = f.inbound;
  const depart = out.departureDate.slice(0, 10);
  const ret = back.departureDate.slice(0, 10);
  const minutes = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);
  return {
    provider: "ryanair",
    cached: false,
    origin: out.departureAirport.iataCode,
    destination: out.arrivalAirport.iataCode,
    depart,
    ret,
    price: Math.round(f.summary.price.value),
    stops: 0,
    // Las horas son locales de cada aeropuerto: con cambio de huso la duración es aproximada.
    durationMinutes: Math.max(30, minutes(out.departureDate, out.arrivalDate)),
    airline: "Ryanair",
    departTime: out.departureDate.slice(11, 16),
    arriveTime: out.arrivalDate.slice(11, 16),
    returnTime: back.departureDate.slice(11, 16),
    returnArriveTime: back.arrivalDate.slice(11, 16),
    returnArriveDate: back.arrivalDate.slice(0, 10),
    link: bookingLink(out.departureAirport.iataCode, out.arrivalAirport.iataCode, depart, ret, adults),
  };
}

/** Tarifas de ida y vuelta para unas fechas exactas. Sin destino = todos los destinos de Ryanair desde el origen. */
export async function ryanairFares(
  origin: string,
  destination: string | null,
  depart: string,
  ret: string,
  adults = 1,
): Promise<FlightOffer[]> {
  return cached(`ryr:${origin}:${destination ?? "*"}:${depart}:${ret}:${adults}`, 3 * 3600, async () => {
    const params = new URLSearchParams({
      departureAirportIataCode: origin,
      outboundDepartureDateFrom: depart,
      outboundDepartureDateTo: depart,
      inboundDepartureDateFrom: ret,
      inboundDepartureDateTo: ret,
      adultPaxCount: String(adults),
      currency: "EUR",
      market: "es-es",
    });
    if (destination) params.set("arrivalAirportIataCode", destination);
    const res = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Ryanair ${res.status}`);
    const json = (await res.json()) as { fares?: RyrFare[] };
    return (json.fares ?? []).filter((f) => f.outbound && f.inbound).map((f) => toOffer(f, adults));
  });
}

type RyrOneWay = { outbound: RyrLeg };

/** Vuelos de solo ida de un día y una franja horaria; sin destino = el más barato a cada destino. */
async function oneWayBand(origin: string, destination: string | null, day: string, from: string, to: string, adults: number): Promise<RyrLeg[]> {
  return cached(`ryr:owband:${origin}:${destination ?? "*"}:${day}:${from}:${to}:${adults}`, 3 * 3600, async () => {
    const p = new URLSearchParams({
      departureAirportIataCode: origin,
      outboundDepartureDateFrom: day,
      outboundDepartureDateTo: day,
      outboundDepartureTimeFrom: from,
      outboundDepartureTimeTo: to,
      adultPaxCount: String(adults),
      currency: "EUR",
      market: "es-es",
    });
    if (destination) p.set("arrivalAirportIataCode", destination);
    const res = await fetch(`https://services-api.ryanair.com/farfnd/v4/oneWayFares?${p}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    return (((await res.json()) as { fares?: RyrOneWay[] }).fares ?? []).map((f) => f.outbound).filter((l) => l?.price?.value);
  }).catch(() => []);
}

// Franjas amplias para los viajes de un día: después se aplican las horas que haya elegido cada uno.
const DAY_OUT_TO = "15:00";
const DAY_BACK_FROM = "13:00";
// Destinos por día a los que se busca la vuelta (los más baratos a la ida).
const DAY_MAX_DESTS = 8;

/**
 * Viajes de un día con Ryanair: su buscador de ida y vuelta no da vuelos del mismo día, así que
 * se combinan dos de solo ida: por la mañana a cada destino y por la tarde-noche de vuelta.
 */
export async function ryanairDayTrips(origin: string, destination: string | null, days: string[], adults = 1): Promise<FlightOffer[]> {
  const out: FlightOffer[] = [];
  for (const day of days) {
    const outs = (await oneWayBand(origin, destination, day, "00:00", DAY_OUT_TO, adults))
      .sort((a, b) => a.price.value - b.price.value)
      .slice(0, DAY_MAX_DESTS);
    const backs = await Promise.all(
      outs.map((o) => oneWayBand(o.arrivalAirport.iataCode, origin, day, DAY_BACK_FROM, "23:59", adults).then((b) => b[0])),
    );
    outs.forEach((o, i) => {
      const b = backs[i];
      if (!b) return;
      const dest = o.arrivalAirport.iataCode;
      out.push({
        provider: "ryanair",
        cached: false,
        origin,
        destination: dest,
        depart: day,
        ret: day,
        price: Math.round(o.price.value + b.price.value),
        stops: 0,
        durationMinutes: Math.max(30, Math.round((Date.parse(o.arrivalDate) - Date.parse(o.departureDate)) / 60000)),
        airline: "Ryanair",
        departTime: o.departureDate.slice(11, 16),
        arriveTime: o.arrivalDate.slice(11, 16),
        returnTime: b.departureDate.slice(11, 16),
        returnArriveTime: b.arrivalDate.slice(11, 16),
        returnArriveDate: b.arrivalDate.slice(0, 10),
        link: bookingLink(origin, dest, day, day, adults),
      });
    });
  }
  return out;
}

/** Lanza las consultas de varias fechas con poca concurrencia para no saturar la API. */
export async function ryanairWindows(
  origin: string,
  destination: string | null,
  windows: { depart: string; ret: string }[],
  adults = 1,
): Promise<FlightOffer[]> {
  const out: FlightOffer[] = [];
  for (let i = 0; i < windows.length; i += 4) {
    const chunk = windows.slice(i, i + 4);
    const res = await Promise.all(
      chunk.map((w) => ryanairFares(origin, destination, w.depart, w.ret, adults).catch(() => [] as FlightOffer[])),
    );
    out.push(...res.flat());
  }
  return out;
}
