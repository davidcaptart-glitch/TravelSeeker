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
  // Nórdicos: taxímetro caro (aprox., convertido a EUR).
  FI: { flag: 6.9, perKm: 1.6, perMin: 0.9, currency: "EUR" },
  SE: { flag: 5.5, perKm: 1.4, perMin: 0.8, currency: "EUR" },
  NO: { flag: 7.0, perKm: 2.0, perMin: 1.1, currency: "EUR" },
  DK: { flag: 5.0, perKm: 1.8, perMin: 0.8, currency: "EUR" },
  IS: { flag: 6.0, perKm: 2.2, perMin: 1.0, currency: "EUR" },
  HR: { flag: 2.5, perKm: 1.2, perMin: 0.3, currency: "EUR" },
  RO: { flag: 1.0, perKm: 0.7, perMin: 0.2, currency: "EUR" },
  MT: { flag: 5.0, perKm: 1.5, perMin: 0.4, currency: "EUR" },
  // Resto del mundo (aprox., convertido a EUR).
  US: { flag: 3.5, perKm: 1.9, perMin: 0.5, currency: "EUR" },
  CA: { flag: 3.5, perKm: 1.4, perMin: 0.5, currency: "EUR" },
  MX: { flag: 1.5, perKm: 0.6, perMin: 0.15, currency: "EUR" },
  BR: { flag: 1.0, perKm: 0.7, perMin: 0.15, currency: "EUR" },
  AR: { flag: 1.0, perKm: 0.6, perMin: 0.15, currency: "EUR" },
  CO: { flag: 1.0, perKm: 0.4, perMin: 0.1, currency: "EUR" },
  PE: { flag: 1.5, perKm: 0.5, perMin: 0.1, currency: "EUR" },
  CL: { flag: 1.0, perKm: 0.9, perMin: 0.2, currency: "EUR" },
  JP: { flag: 3.0, perKm: 2.5, perMin: 0.6, currency: "EUR" },
  KR: { flag: 3.0, perKm: 0.9, perMin: 0.3, currency: "EUR" },
  CN: { flag: 1.8, perKm: 0.4, perMin: 0.1, currency: "EUR" },
  IN: { flag: 0.5, perKm: 0.25, perMin: 0.05, currency: "EUR" },
  TH: { flag: 1.0, perKm: 0.3, perMin: 0.1, currency: "EUR" },
  AE: { flag: 3.0, perKm: 0.6, perMin: 0.15, currency: "EUR" },
  MA: { flag: 1.0, perKm: 0.4, perMin: 0.1, currency: "EUR" },
  EG: { flag: 0.5, perKm: 0.2, perMin: 0.05, currency: "EUR" },
  ZA: { flag: 1.0, perKm: 0.8, perMin: 0.2, currency: "EUR" },
  AU: { flag: 3.0, perKm: 1.4, perMin: 0.6, currency: "EUR" },
  NZ: { flag: 2.5, perKm: 1.8, perMin: 0.5, currency: "EUR" },
  TR: { flag: 1.0, perKm: 0.6, perMin: 0.15, currency: "EUR" },
};
const DEFAULT_TAXI: TaxiTariff = { flag: 3.5, perKm: 1.5, perMin: 0.45, currency: "EUR" };

// Tarifas fijas oficiales aeropuerto ↔ centro de la ciudad: [mínima, máxima] según la zona de destino.
const TAXI_FIXED: Record<string, [number, number]> = {
  CDG: [56, 65], // París: orilla derecha / orilla izquierda
  ORY: [36, 44],
  MAD: [33, 33], // dentro de la M-30
  FCO: [55, 55], // dentro de la Muralla Aureliana
  CIA: [40, 40],
  ATH: [40, 55], // tarifa de día / de noche al centro
};

/**
 * Precio del taxi: tarifa fija oficial del aeropuerto si existe, si no taxímetro (bajada + km + tiempo)
 * con una horquilla: tráfico, suplementos de aeropuerto o equipaje y tarifa nocturna.
 */
export function taxiFare(country: string | undefined, km: number, minutes: number, airportIata?: string): { min: number; max: number; fixed: boolean } {
  const fixed = airportIata ? TAXI_FIXED[airportIata] : undefined;
  if (fixed && km < 45) return { min: fixed[0], max: fixed[1], fixed: true };
  const t = (country && TAXI[country]) || DEFAULT_TAXI;
  // Se asume que ~25 % del tiempo es tráfico lento facturado por minuto.
  const base = t.flag + t.perKm * km + t.perMin * minutes * 0.25;
  return { min: Math.round(base * 0.9), max: Math.round(base * 1.3 + (airportIata ? 4 : 0)), fixed: false };
}

export function taxiCost(country: string | undefined, km: number, minutes: number, airportIata?: string): number {
  return taxiFare(country, km, minutes, airportIata).min;
}

// Billete sencillo de transporte urbano (bus/metro/tranvía) por país, en EUR.
const URBAN_TICKET: Record<string, number> = {
  ES: 2.0, FR: 2.15, PT: 1.85, IT: 1.9, DE: 3.5, NL: 3.4, BE: 2.6, GB: 3.0, IE: 2.2,
  PL: 1.2, CZ: 1.4, HU: 1.15, AT: 2.6, CH: 3.6, GR: 1.2,
};

// Lanzaderas de aeropuerto con precio propio conocido (aprox.).
// Billete del primer tramo desde el aeropuerto (tren exprés o bus lanzadera), aprox. en EUR.
const AIRPORT_SHUTTLE: Record<string, number> = {
  CDG: 14, ORY: 14, BCN: 7.25, MAD: 5, LIS: 2, KRK: 4.5, FCO: 14, LHR: 14, AMS: 6.5, MPL: 1.6, BVA: 17,
  STN: 23, LTN: 22, LGW: 22, MXP: 13, BGY: 10, OSL: 23, ARN: 32, MUC: 13.5, ZRH: 7, VIE: 4.5,
  BUD: 6, DUB: 9, EDI: 5.5, VCE: 10, NAP: 5, ATH: 9, OPO: 2.2, AGP: 1.85, PMI: 5, CRL: 18,
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
