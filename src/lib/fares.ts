// Tarifas aproximadas para estimar el coste del transporte. Son orientativas:
// la app siempre enseña enlaces para comprobar el precio real.

type TaxiTariff = { flag: number; perKm: number; perMin: number; currency: "EUR" | "PLN" | "GBP" | "CHF" | "CZK" | "HUF" };

// Bajada de bandera + €/km + €/min de espera/atasco (tarifa diurna aproximada, convertida a EUR).
const TAXI: Record<string, TaxiTariff> = {
  ES: { flag: 2.6, perKm: 1.25, perMin: 0.35, currency: "EUR" },
  FR: { flag: 4.2, perKm: 1.3, perMin: 0.6, currency: "EUR" },
  PT: { flag: 3.25, perKm: 0.9, perMin: 0.3, currency: "EUR" },
  IT: { flag: 3.5, perKm: 1.4, perMin: 0.5, currency: "EUR" },
  DE: { flag: 4.5, perKm: 2.4, perMin: 0.6, currency: "EUR" },
  NL: { flag: 4.2, perKm: 3.0, perMin: 0.5, currency: "EUR" },
  BE: { flag: 2.6, perKm: 2.2, perMin: 0.5, currency: "EUR" },
  GB: { flag: 4.5, perKm: 2.3, perMin: 0.6, currency: "GBP" },
  IE: { flag: 4.4, perKm: 1.4, perMin: 0.5, currency: "EUR" },
  PL: { flag: 2.2, perKm: 0.8, perMin: 0.25, currency: "PLN" },
  CZ: { flag: 2.5, perKm: 1.1, perMin: 0.3, currency: "CZK" },
  HU: { flag: 3.0, perKm: 1.2, perMin: 0.35, currency: "HUF" },
  AT: { flag: 4.5, perKm: 1.8, perMin: 0.5, currency: "EUR" },
  CH: { flag: 7.0, perKm: 4.0, perMin: 1.0, currency: "CHF" },
  GR: { flag: 1.9, perKm: 0.9, perMin: 0.25, currency: "EUR" },
};
const DEFAULT_TAXI: TaxiTariff = { flag: 3.5, perKm: 1.5, perMin: 0.45, currency: "EUR" };

// Tarifas fijas oficiales aeropuerto ↔ ciudad (aprox.).
const TAXI_FIXED: Record<string, number> = {
  CDG: 60,
  ORY: 40,
  MAD: 33,
  LIS: 20,
  FCO: 55,
};

export function taxiCost(country: string | undefined, km: number, minutes: number, airportIata?: string): number {
  if (airportIata && TAXI_FIXED[airportIata] && km < 45) return TAXI_FIXED[airportIata];
  const t = (country && TAXI[country]) || DEFAULT_TAXI;
  // Se asume que ~25 % del tiempo es tráfico lento facturado por minuto.
  return Math.round(t.flag + t.perKm * km + t.perMin * minutes * 0.25);
}

// Billete sencillo de transporte urbano (bus/metro/tranvía) por país, en EUR.
const URBAN_TICKET: Record<string, number> = {
  ES: 2.0, FR: 2.15, PT: 1.85, IT: 1.9, DE: 3.5, NL: 3.4, BE: 2.6, GB: 3.0, IE: 2.2,
  PL: 1.2, CZ: 1.4, HU: 1.15, AT: 2.6, CH: 3.6, GR: 1.2,
};

// Lanzaderas de aeropuerto con precio propio conocido (aprox.).
const AIRPORT_SHUTTLE: Record<string, number> = {
  CDG: 14, ORY: 14, BCN: 5.9, MAD: 5, LIS: 2, KRK: 4.5, FCO: 14, LHR: 14, AMS: 6.5, MPL: 1.6, BVA: 17,
};

export function legCost(mode: string, km: number, country: string | undefined, fromAirport?: string): number {
  const m = mode.toUpperCase();
  if (m === "WALK" || m === "BIKE") return 0;
  if (fromAirport && AIRPORT_SHUTTLE[fromAirport]) return AIRPORT_SHUTTLE[fromAirport];
  if (["BUS", "TRAM", "SUBWAY", "METRO", "TRANSIT", "FUNICULAR", "CABLE_CAR"].includes(m)) {
    // Un bus de más de 40 km suele ser interurbano: se tarifica por distancia.
    if (m === "BUS" && km > 40) return Math.round(Math.max(3, km * 0.07) * 100) / 100;
    return (country && URBAN_TICKET[country]) || 2;
  }
  if (m === "COACH") return Math.round(Math.max(5, km * 0.06));
  if (m === "HIGHSPEED_RAIL") return Math.round(Math.max(15, km * 0.12));
  if (m === "LONG_DISTANCE" || m === "NIGHT_RAIL") return Math.round(Math.max(10, km * 0.1));
  if (m === "REGIONAL_RAIL" || m === "REGIONAL_FAST_RAIL" || m === "RAIL" || m === "SUBURBAN") {
    return Math.round(Math.max(2, km * 0.1) * 100) / 100;
  }
  if (m === "FERRY") return Math.round(Math.max(5, km * 0.15));
  return Math.round(Math.max(2, km * 0.1));
}

export const MODE_LABELS: Record<string, string> = {
  WALK: "A pie",
  BUS: "Bus",
  COACH: "Autocar",
  TRAM: "Tranvía",
  SUBWAY: "Metro",
  METRO: "Metro",
  FERRY: "Ferri",
  RAIL: "Tren",
  SUBURBAN: "Cercanías",
  REGIONAL_RAIL: "Tren regional",
  REGIONAL_FAST_RAIL: "Tren regional rápido",
  LONG_DISTANCE: "Tren larga distancia",
  HIGHSPEED_RAIL: "Alta velocidad",
  NIGHT_RAIL: "Tren nocturno",
  TAXI: "Taxi",
  FLIGHT: "Avión",
};
