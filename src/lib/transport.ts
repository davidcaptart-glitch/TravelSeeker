import type { Translator } from "@/i18n/core";
import type { Format } from "@/i18n/format";
import type { NsMessages } from "@/i18n/messages";
import type { GroundOption } from "./types";

/**
 * Enlaces a las apps de transporte y elección de la mejor opción para un trayecto.
 * Funciona para cualquier ubicación: usa las coordenadas reales del trayecto y el país del destino.
 * Sin dependencias de servidor (lo usa la interfaz).
 */

type Pt = { label: string; lat: number; lon: number };
export type AppLink = { label: string; url: string; primary?: boolean };

// Apps de taxi y VTC disponibles en cada país (en las ciudades grandes; en pueblos puede no haber).
const RIDE_APPS: Record<string, string[]> = {
  ES: ["Uber", "Cabify", "FREENOW", "Bolt"],
  PT: ["Uber", "Bolt", "FREENOW"],
  FR: ["Uber", "Bolt", "FREENOW", "G7"],
  IT: ["itTaxi", "FREENOW", "Uber"],
  DE: ["FREENOW", "Uber", "Bolt"],
  AT: ["Uber", "Bolt", "FREENOW"],
  CH: ["Uber", "Bolt"],
  NL: ["Uber", "Bolt"],
  BE: ["Uber", "Bolt"],
  GB: ["Uber", "Bolt", "FREENOW"],
  IE: ["FREENOW", "Uber", "Bolt"],
  PL: ["Bolt", "Uber", "FREENOW"],
  CZ: ["Bolt", "Uber", "Liftago"],
  SK: ["Bolt", "Uber"],
  HU: ["Bolt", "Főtaxi"],
  GR: ["FREENOW", "Uber", "Bolt"],
  HR: ["Bolt", "Uber"],
  RO: ["Bolt", "Uber"],
  BG: ["Bolt", "Uber"],
  FI: ["Bolt", "Uber"],
  SE: ["Bolt", "Uber"],
  NO: ["Bolt", "Uber"],
  DK: ["Dantaxi"],
  EE: ["Bolt", "Uber"],
  LV: ["Bolt", "Uber"],
  LT: ["Bolt", "Uber"],
  MT: ["Bolt", "Uber"],
  CY: ["Bolt"],
  TR: ["BiTaksi", "Uber"],
  IS: ["Hreyfill"],
  RS: ["CarGo", "Yandex Go"],
  // Resto del mundo.
  US: ["Uber", "Lyft"],
  CA: ["Uber", "Lyft"],
  MX: ["Uber", "DiDi", "Cabify"],
  CU: [],
  DO: ["Uber", "inDrive"],
  CO: ["Uber", "DiDi", "Cabify", "inDrive"],
  PE: ["Uber", "Cabify", "DiDi", "inDrive"],
  CL: ["Uber", "Cabify", "DiDi"],
  AR: ["Uber", "Cabify", "DiDi"],
  UY: ["Uber", "Cabify"],
  BR: ["Uber", "99"],
  EC: ["Uber", "DiDi", "inDrive"],
  CR: ["Uber", "DiDi"],
  PA: ["Uber", "Cabify", "inDrive"],
  MA: ["Careem", "inDrive"],
  EG: ["Uber", "Careem", "inDrive"],
  ZA: ["Uber", "Bolt"],
  KE: ["Uber", "Bolt"],
  NG: ["Uber", "Bolt"],
  TZ: ["Uber", "Bolt"],
  AE: ["Careem", "Uber"],
  QA: ["Uber", "Careem"],
  SA: ["Uber", "Careem"],
  JO: ["Careem", "Uber"],
  IL: ["Gett", "Yango"],
  IN: ["Uber", "Ola"],
  TH: ["Grab", "Bolt"],
  SG: ["Grab", "Gojek"],
  MY: ["Grab"],
  ID: ["Grab", "Gojek"],
  PH: ["Grab"],
  VN: ["Grab", "Be"],
  JP: ["GO", "Uber"],
  KR: ["Kakao T", "Uber"],
  CN: ["DiDi"],
  HK: ["Uber"],
  TW: ["Uber"],
  AU: ["Uber", "DiDi"],
  NZ: ["Uber"],
};

const RIDE_URL: Record<string, (from: Pt, to: Pt) => string> = {
  // Enlace universal documentado por Uber: abre la app con recogida y destino ya puestos.
  Uber: (f, t) => {
    const p = new URLSearchParams({
      action: "setPickup",
      "pickup[latitude]": String(f.lat),
      "pickup[longitude]": String(f.lon),
      "pickup[nickname]": f.label,
      "dropoff[latitude]": String(t.lat),
      "dropoff[longitude]": String(t.lon),
      "dropoff[nickname]": t.label,
    });
    return `https://m.uber.com/ul/?${p}`;
  },
  Bolt: () => "https://bolt.eu/es-es/rides/",
  FREENOW: () => "https://www.free-now.com/es/",
  Cabify: () => "https://cabify.com/es",
  G7: () => "https://www.g7.fr/en/",
  itTaxi: () => "https://www.itaxi.it/",
  Liftago: () => "https://www.liftago.com/",
  "Főtaxi": () => "https://www.fotaxi.hu/en/",
  Dantaxi: () => "https://www.dantaxi.dk/",
  BiTaksi: () => "https://www.bitaksi.com/",
  Hreyfill: () => "https://www.hreyfill.is/",
  CarGo: () => "https://cargo-app.com/",
  "Yandex Go": () => "https://go.yandex/",
  Lyft: () => "https://www.lyft.com/",
  DiDi: () => "https://web.didiglobal.com/",
  "99": () => "https://99app.com/",
  inDrive: () => "https://indrive.com/",
  Careem: () => "https://www.careem.com/",
  Gett: () => "https://gett.com/",
  Yango: () => "https://yango.com/",
  Ola: () => "https://www.olacabs.com/",
  Grab: () => "https://www.grab.com/",
  Gojek: () => "https://www.gojek.com/",
  Be: () => "https://be.com.vn/",
  GO: () => "https://go.mo-t.com/",
  "Kakao T": () => "https://www.kakaomobility.com/",
};

/** Apps para pedir un taxi en ese país (Uber con el trayecto ya puesto). */
export function taxiApps(country: string | undefined, from: Pt, to: Pt): AppLink[] {
  const apps = (country && RIDE_APPS[country]) || ["Uber", "Bolt"];
  if (!apps.length) return [];
  return apps.filter((a) => RIDE_URL[a]).map((a, i) => ({ label: a, url: RIDE_URL[a](from, to), primary: i === 0 }));
}

/** Apps para seguir la ruta en transporte público, con origen y destino ya puestos. */
export function transitApps(from: Pt, to: Pt, lang = "es"): AppLink[] {
  const g = new URLSearchParams({ api: "1", origin: `${from.lat},${from.lon}`, destination: `${to.lat},${to.lon}`, travelmode: "transit" });
  const c = new URLSearchParams({ startcoord: `${from.lat},${from.lon}`, endcoord: `${to.lat},${to.lon}`, startname: from.label, endname: to.label });
  const m = new URLSearchParams({ from: from.label, to: to.label, fll: `${from.lat}_${from.lon}`, tll: `${to.lat}_${to.lon}`, lang });
  return [
    { label: "Google Maps", url: `https://www.google.com/maps/dir/?${g}` },
    { label: "Citymapper", url: `https://citymapper.com/directions?${c}` },
    { label: "Moovit", url: `https://moovitapp.com/?${m}` },
  ];
}

const isTaxi = (o: GroundOption) => o.kind === "taxi";
const rides = (o: GroundOption) => o.legs.filter((l) => l.mode !== "WALK");
const walkMin = (o: GroundOption) => o.legs.filter((l) => l.mode === "WALK").reduce((s, l) => s + l.minutes, 0);

/** Precio por persona: el taxi se paga por vehículo (hasta 4 plazas). */
export function perPerson(o: GroundOption, pax: number): number {
  if (!isTaxi(o)) return o.cost;
  const cars = Math.ceil(pax / 4);
  return (((o.cost + (o.costMax ?? o.cost)) / 2) * cars) / pax;
}

type TransportT = Translator<NsMessages<"transport">>;

/**
 * La opción que más compensa: precio por persona + tiempo (12 €/h) + molestias (transbordos, caminar con maletas).
 * Devuelve también una frase que explica por qué, comparando con la alternativa más clara.
 */
export function recommend(options: GroundOption[], pax: number, t: TransportT, f: Format): { best?: GroundOption; reason?: string } {
  if (!options.length) return {};
  const score = (o: GroundOption) =>
    perPerson(o, pax) + o.minutes * 0.2 + Math.max(0, rides(o).length - 1) * 2.5 + Math.max(0, walkMin(o) - 10) * 0.15;
  const sorted = [...options].sort((a, b) => score(a) - score(b));
  const best = sorted[0];
  if (options.length === 1) {
    return { best, reason: isTaxi(best) ? t("reasonOnlyTaxi") : t("reasonOnlyOne") };
  }
  const taxi = options.find(isTaxi);
  const publicBest = sorted.find((o) => !isTaxi(o));
  // group: 1 si viajáis varios (el ahorro es «entre todos»).
  const group = pax > 1 ? 1 : 0;
  if (!isTaxi(best) && taxi) {
    const saved = f.eur((perPerson(taxi, pax) - perPerson(best, pax)) * pax);
    const dt = best.minutes - taxi.minutes;
    return {
      best,
      reason: dt > 5 ? t("reasonSaveVsTaxiSlower", { amount: saved, group, min: dt }) : t("reasonSaveVsTaxiSame", { amount: saved, group }),
    };
  }
  if (isTaxi(best) && publicBest) {
    const extra = perPerson(best, pax) - perPerson(publicBest, pax);
    const dt = publicBest.minutes - best.minutes;
    if (extra <= 0) return { best, reason: dt > 0 ? t("reasonTaxiCheaperFaster", { min: dt }) : t("reasonTaxiCheaper") };
    if (pax > 1 && extra <= 1) {
      const amount = f.eur(perPerson(best, pax));
      return {
        best,
        reason: dt > 0 ? t("reasonTaxiGroupFaster", { n: pax, amount, min: dt }) : t("reasonTaxiGroupDoor", { n: pax, amount }),
      };
    }
    const direct = rides(publicBest).length > 1 ? 1 : 0;
    return {
      best,
      reason:
        dt > 0
          ? t("reasonTaxiExtraFaster", { amount: f.eur(extra), min: dt, direct })
          : t("reasonTaxiExtraDoor", { amount: f.eur(extra), direct }),
    };
  }
  const second = sorted[1];
  if (best.cost <= second.cost) {
    const fastest = best.minutes <= second.minutes;
    const direct = rides(best).length <= 1;
    if (fastest && direct) return { best, reason: t("reasonCheapestFastestDirect") };
    if (fastest) return { best, reason: t("reasonCheapestFastest") };
    if (direct) return { best, reason: t("reasonCheapestDirect") };
    return { best, reason: t("reasonCheapest") };
  }
  return { best, reason: t("reasonFasterFor", { min: second.minutes - best.minutes, amount: f.eur(best.cost - second.cost) }) };
}
