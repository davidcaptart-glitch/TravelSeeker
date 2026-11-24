import { z } from "zod";

const iata = z.string().regex(/^[A-Z]{3}$/, "Código IATA de 3 letras");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora HH:MM");

export const placeSchema = z.object({
  label: z.string().min(1),
  lat: z.number(),
  lon: z.number(),
  country: z.string().optional(),
});
export type Place = z.infer<typeof placeSchema>;

export const DESTINATION_THEMES = ["playa", "ciudad", "montaña", "nieve", "cultura", "fiesta", "naturaleza"] as const;
export const HOTEL_TYPES = ["hotel", "apartment", "hostel"] as const;
// Regiones del mundo para «Sorpréndeme» (Latinoamérica incluye México, Centroamérica y el Caribe).
export const REGIONS = ["europe", "northamerica", "latam", "africa", "asia", "oceania"] as const;
export type Region = (typeof REGIONS)[number] | "antarctica" | "other";

export const alertConfigSchema = z.object({
  name: z.string().min(1).max(80),
  // flight: avisa en cuanto el vuelo cumple. flight_hotel: solo cuando cumplen vuelo y alojamiento.
  notifyMode: z.enum(["flight", "flight_hotel"]),
  origins: z.array(iata).min(1),
  destination: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("place"), place: placeSchema }),
    z.object({
      kind: z.literal("anywhere"),
      themes: z.array(z.enum(DESTINATION_THEMES)).default([]),
      countries: z.array(z.string().length(2)).default([]),
      // Solo estas regiones del mundo (vacío = cualquiera).
      regions: z.array(z.enum(REGIONS)).default([]),
      // Países que nunca deben salir como destino (p. ej. el tuyo).
      excludeCountries: z.array(z.string().length(2)).default([]),
    }),
  ]),
  // Aeropuertos de llegada elegidos. Vacío = automático (cercanos al destino).
  destinationAirports: z.array(iata).default([]),
  airportRadiusKm: z.number().min(10).max(500).default(150),
  // Rutas alternativas: aeropuertos más lejanos + tren/bus, o ir solo por tierra.
  allowGround: z.boolean().default(false),
  maxGroundMinutes: z.number().min(15).max(24 * 60).default(240),
  groundFrom: placeSchema.optional(),
  dates: z.object({
    months: z.array(z.string().regex(/^\d{4}-\d{2}$/)).min(1),
    weekendsOnly: z.boolean().default(true),
    extraDaysOff: z.array(isoDate).default([]),
    excludeDates: z.array(isoDate).default([]),
    useHolidays: z.boolean().default(true),
    departEveningBefore: z.boolean().default(true),
    // Viaje de un día: ida a primera hora y vuelta por la noche el mismo día, sin alojamiento.
    dayTrip: z.boolean().optional(),
    // Horas del viaje de un día: salida deseada, hora de llegada de vuelta a casa y margen (± horas).
    // Una llegada antes de las 04:00 cuenta como pasada la medianoche (p. ej. 00:30).
    dayTripTimes: z
      .object({ depart: hhmm, arriveHome: hhmm, flexHours: z.number().min(0).max(6).default(1) })
      .optional(),
    minNights: z.number().int().min(1).max(30).default(1),
    maxNights: z.number().int().min(1).max(30).default(4),
    // Días concretos: si hay rangos, se busca solo dentro de ellos (los meses se calculan a partir de ellos).
    // departAfter: hora mínima de salida el primer día. returnBy: hora límite del vuelo de vuelta el último día.
    ranges: z
      .array(z.object({ from: isoDate, to: isoDate, departAfter: hhmm.optional(), returnBy: hhmm.optional() }))
      .optional(),
    // Franjas horarias de salida de los vuelos, cualquier día (p. ej. sin madrugones).
    times: z
      .object({ outFrom: hhmm.optional(), outTo: hhmm.optional(), backFrom: hhmm.optional(), backTo: hhmm.optional() })
      .optional(),
  }),
  flight: z.object({
    maxPrice: z.number().positive(),
    maxStops: z.number().int().min(0).max(2).default(1),
    passengers: z.number().int().min(1).max(9).default(1),
    maxDurationHours: z.number().positive().optional(),
    // Probar también dos vuelos de solo ida enlazados en otra ciudad (la app elige cuál) si sale más barato.
    selfTransfer: z.boolean().optional(), // sin valor = sí
  }),
  hotel: z
    .object({
      types: z.array(z.enum(HOTEL_TYPES)).min(1),
      maxPricePerNight: z.number().positive().optional(),
      maxTotal: z.number().positive().optional(),
      minRating: z.number().min(0).max(5).optional(),
      minStars: z.number().int().min(0).max(5).optional(),
      // Código de ciudad de TripAdvisor ("g274772") cuando no se encuentra solo.
      tripadvisorGeo: z.string().regex(/^g\d+$/).optional(),
    })
    .optional(),
  checkEveryHours: z.number().min(1).max(48).default(6),
});
export type AlertConfig = z.infer<typeof alertConfigSchema>;

/** Saca el código de ciudad ("g274772") de un enlace de TripAdvisor o del propio código. */
export function parseTripadvisorGeo(text: string): string | undefined {
  const m = text.trim().match(/(?:^|[^a-z0-9])g(\d{3,})(?:[^0-9]|$)/i);
  return m ? `g${m[1]}` : undefined;
}

export type Alert = {
  id: string;
  userId: string;
  active: boolean;
  config: AlertConfig;
  lastRunAt: string | null;
  lastSummary: RunSummary | null;
};

export type TripWindow = {
  depart: string;
  ret: string;
  nights: number;
  // Días laborables que tendrías que pedir (las tardes de salida no cuentan).
  workdaysUsed: number;
  // Límites de un rango de días concretos: no salir antes de / volver como tarde ("AAAA-MM-DDTHH:MM").
  earliest?: string;
  latestReturn?: string;
};

/** Un tramo de solo ida dentro de un viaje combinado (billete propio). */
export type FlightLeg = {
  provider: string;
  airline: string;
  from: string;
  to: string;
  date: string;
  departTime: string;
  arriveTime?: string;
  arriveDate?: string;
  // Hora de llegada calculada (salida + duración), no la del horario.
  estimated?: boolean;
  price: number;
  stops: number;
  link?: string;
};

export type FlightOffer = {
  provider: string;
  cached: boolean;
  origin: string;
  destination: string;
  depart: string;
  ret: string;
  price: number;
  stops: number;
  durationMinutes?: number;
  airline?: string;
  departTime?: string;
  arriveTime?: string;
  // Hora de salida del vuelo de vuelta (si se conoce).
  returnTime?: string;
  // Hora de llegada del vuelo de vuelta (si se conoce) y su fecha si es otro día.
  returnArriveTime?: string;
  returnArriveDate?: string;
  link?: string;
  // Viaje combinado: billetes separados y ciudades donde se enlaza.
  legs?: FlightLeg[];
  via?: string[];
};

export type HotelOffer = {
  provider: string;
  name: string;
  type: (typeof HOTEL_TYPES)[number];
  pricePerNight: number;
  total: number;
  rating?: number;
  stars?: number;
  lat?: number;
  lon?: number;
  link?: string;
  image?: string;
  // Rango de precio por noche habitual del alojamiento (según TripAdvisor).
  usualMin?: number;
  usualMax?: number;
  // Dónde reservarlo, con fechas y personas ya puestas (la más barata primero) y la ficha con opiniones.
  // label "official" = web oficial del hotel (se abre Google Hotels, que la enlaza).
  bookingLinks?: { label: string; url: string; pricePerNight?: number; official?: boolean }[];
  reviewsLink?: string;
};

export type TransitLeg = {
  mode: string;
  from: string;
  to: string;
  line?: string;
  agency?: string;
  minutes: number;
  km: number;
  cost: number;
  // Precio consultado al operador para esa fecha (si no, es una estimación).
  realPrice?: boolean;
  departTime?: string;
  arriveTime?: string;
  // Datos del operador (de los horarios oficiales): web, página de la línea, compra del billete y colores.
  agencyUrl?: string;
  routeUrl?: string;
  ticketUrl?: string;
  headsign?: string;
  color?: string;
  textColor?: string;
};

export type GroundOption = {
  kind: "transit" | "taxi" | "mixed";
  label: string;
  minutes: number;
  cost: number;
  legs: TransitLeg[];
  // true si algún tramo con coste usa precio estimado.
  estimated: boolean;
  mapsLink?: string;
  bookingLinks?: { label: string; url: string }[];
  // Taxi: horquilla de precio y si es una tarifa fija oficial del aeropuerto.
  costMax?: number;
  fixedFare?: boolean;
};

export type LastMile = {
  from: { label: string; lat: number; lon: number };
  to: { label: string; lat: number; lon: number };
  options: GroundOption[];
};

export type MatchData = {
  window: TripWindow;
  flight: FlightOffer;
  hotel?: HotelOffer;
  lastMile?: LastMile;
  destinationLabel: string;
};

export const MATCH_STATUSES = ["new", "saved", "dismissed", "booked"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export type Match = {
  id: string;
  alertId: string;
  kind: "flight" | "full";
  totalPrice: number;
  data: MatchData;
  seen: boolean;
  status: MatchStatus;
  createdAt: string;
  updatedAt: string;
};

export type RunSummary = {
  at: string;
  windows: number;
  screened: number;
  candidates: number;
  confirmed: number;
  flightMatches: number;
  fullMatches: number;
  notified: number;
  // Combinaciones de dos vuelos que salían más baratas que el vuelo normal.
  combos?: number;
  groundOnly?: GroundOption;
  // Todas las alternativas por tierra (la más rápida es groundOnly).
  groundOnlyOptions?: GroundOption[];
  // Vuelo ida y vuelta más barato por persona visto en tus fechas, cumpla o no tu precio.
  cheapestForDates?: number;
  // Lo mismo en fechas parecidas: mismos meses y noches, cualquier día de la semana.
  cheapestSimilar?: number;
  // Tendencia del mercado: lo más barato de cada mes (ida + vuelta estimada), próximos 12 meses.
  market?: { route: string; months: { month: string; price: number }[] };
  // Histórico guardado de la ruta (todos los precios vistos en viajes parecidos) y qué tal es el mejor de ahora.
  routeHistory?: {
    samples: number;
    days: number;
    since: string;
    min: number;
    p25: number;
    median: number;
    minDepart: string;
    // Proporción de precios guardados más caros que el mejor de ahora (0–1).
    bestShare?: number;
    best?: number;
  };
  notes: string[];
};

export type PricePoint = { at: string; flight: number | null; total: number | null };
