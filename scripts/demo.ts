// Crea las tres alertas de ejemplo (París, Cracovia, Lisboa + Cap d'Agde) para un usuario y las ejecuta.
// Uso: npm run demo -- <id-de-usuario>   (el id está en Ajustes de la app)
import { runAlert } from "@/lib/engine";
import { createAlert, ensureUser, getAlert } from "@/lib/repo";
import type { AlertConfig } from "@/lib/types";

const userId = process.argv[2] ?? "demo-user";

function nextMonths(n: number): string[] {
  const d = new Date();
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1 + i, 1));
    return x.toISOString().slice(0, 7);
  });
}

const baseDates = {
  months: nextMonths(2),
  weekendsOnly: true,
  extraDaysOff: [],
  excludeDates: [],
  useHolidays: true,
  departEveningBefore: true,
  minNights: 1,
  maxNights: 4,
};

const examples: AlertConfig[] = [
  {
    name: "París (aviso con el vuelo)",
    notifyMode: "flight",
    origins: ["BCN"],
    destination: { kind: "place", place: { label: "París", lat: 48.8566, lon: 2.3522, country: "FR" } },
    destinationAirports: ["ORY"],
    airportRadiusKm: 60,
    allowGround: false,
    maxGroundMinutes: 120,
    dates: baseDates,
    flight: { maxPrice: 120, maxStops: 0, passengers: 1 },
    hotel: { types: ["hotel", "apartment"], maxPricePerNight: 110, minRating: 4 },
    checkEveryHours: 6,
  },
  {
    name: "Cracovia (vuelo + alojamiento)",
    notifyMode: "flight_hotel",
    origins: ["BCN", "GRO"],
    destination: { kind: "place", place: { label: "Cracovia", lat: 50.0614, lon: 19.9366, country: "PL" } },
    destinationAirports: [],
    airportRadiusKm: 120,
    allowGround: false,
    maxGroundMinutes: 180,
    dates: { ...baseDates, maxNights: 3 },
    flight: { maxPrice: 140, maxStops: 1, passengers: 2 },
    hotel: { types: ["hotel", "apartment"], maxPricePerNight: 80, minRating: 4 },
    checkEveryHours: 6,
  },
  {
    name: "Lisboa (solo vuelo)",
    notifyMode: "flight",
    origins: ["BCN"],
    destination: { kind: "place", place: { label: "Lisboa", lat: 38.7223, lon: -9.1393, country: "PT" } },
    destinationAirports: ["LIS"],
    airportRadiusKm: 50,
    allowGround: false,
    maxGroundMinutes: 120,
    dates: baseDates,
    flight: { maxPrice: 110, maxStops: 0, passengers: 1 },
    checkEveryHours: 6,
  },
  {
    name: "Cap d'Agde (rutas combinadas)",
    notifyMode: "flight",
    origins: ["MAD"],
    destination: { kind: "place", place: { label: "Cap d'Agde", lat: 43.2845, lon: 3.5118, country: "FR" } },
    destinationAirports: [],
    airportRadiusKm: 100,
    allowGround: true,
    maxGroundMinutes: 300,
    groundFrom: { label: "Barcelona Sants", lat: 41.3792, lon: 2.1404, country: "ES" },
    dates: baseDates,
    flight: { maxPrice: 150, maxStops: 1, passengers: 1 },
    checkEveryHours: 6,
  },
];

async function main() {
  await ensureUser(userId);
  for (const cfg of examples) {
    const id = await createAlert(userId, cfg);
    const alert = (await getAlert(id))!;
    const s = await runAlert(alert);
    console.log(`${cfg.name}: fechas=${s.windows} cribados=${s.screened} candidatos=${s.candidates} vuelos=${s.flightMatches} completos=${s.fullMatches}`);
    if (s.groundOnly) console.log(`  por tierra: ${s.groundOnly.label} · ${s.groundOnly.minutes} min · ~${s.groundOnly.cost} €`);
    for (const n of s.notes) console.log(`  nota: ${n}`);
  }
}

main();
