import { z } from "zod";

const iata = z.string().regex(/^[A-Z]{3}$/, "Código IATA de 3 letras");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const placeSchema = z.object({
  label: z.string().min(1),
  lat: z.number(),
  lon: z.number(),
  country: z.string().optional(),
});
export type Place = z.infer<typeof placeSchema>;

export const DESTINATION_THEMES = ["playa", "ciudad", "montaña", "nieve", "cultura", "fiesta", "naturaleza"] as const;
export const HOTEL_TYPES = ["hotel", "apartment", "hostel"] as const;

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
    minNights: z.number().int().min(1).max(30).default(1),
    maxNights: z.number().int().min(1).max(30).default(4),
  }),
  flight: z.object({
    maxPrice: z.number().positive(),
    maxStops: z.number().int().min(0).max(2).default(1),
    passengers: z.number().int().min(1).max(9).default(1),
    maxDurationHours: z.number().positive().optional(),
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
  link?: string;
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

export type Match = {
  id: string;
  alertId: string;
  kind: "flight" | "full";
  totalPrice: number;
  data: MatchData;
  seen: boolean;
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
  groundOnly?: GroundOption;
  // Todas las alternativas por tierra (la más rápida es groundOnly).
  groundOnlyOptions?: GroundOption[];
  // Vuelo ida y vuelta más barato por persona visto en tus fechas, cumpla o no tu precio.
  cheapestForDates?: number;
  // Lo mismo en fechas parecidas: mismos meses y noches, cualquier día de la semana.
  cheapestSimilar?: number;
  // Tendencia del mercado: lo más barato de cada mes (ida + vuelta estimada), próximos 12 meses.
  market?: { route: string; months: { month: string; price: number }[] };
  notes: string[];
};

export type PricePoint = { at: string; flight: number | null; total: number | null };
