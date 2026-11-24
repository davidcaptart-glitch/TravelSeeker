import type { AlertConfig, TripWindow } from "./types";

const DAY = 86_400_000;

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseISO(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function addDays(s: string, n: number): string {
  return toISO(new Date(parseISO(s).getTime() + n * DAY));
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY);
}

function isWeekend(s: string): boolean {
  const wd = parseISO(s).getUTCDay();
  return wd === 0 || wd === 6;
}

function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * Genera las combinaciones ida/vuelta posibles para una alerta.
 * - weekendsOnly: bloques de días libres (fin de semana + festivos + días que te puedes coger),
 *   saliendo el primer día del bloque o la tarde anterior.
 * - si no: cualquier ida dentro de los meses con estancia entre minNights y maxNights.
 */
export function generateWindows(
  dates: AlertConfig["dates"],
  holidays: Set<string>,
  today = toISO(new Date()),
): TripWindow[] {
  const extra = new Set(dates.extraDaysOff);
  const excluded = new Set(dates.excludeDates);
  const isFree = (d: string) => isWeekend(d) || holidays.has(d) || extra.has(d);
  const workdays = (from: string, to: string, skipFirst: boolean) => {
    let n = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (skipFirst && d === from) continue;
      if (!isFree(d)) n++;
    }
    return n;
  };

  const out = new Map<string, TripWindow>();
  const push = (depart: string, ret: string, eveningStart: boolean, limits: Pick<TripWindow, "earliest" | "latestReturn"> = {}) => {
    const nights = diffDays(depart, ret);
    if (nights < dates.minNights || nights > dates.maxNights) return;
    if (depart <= today || excluded.has(depart) || excluded.has(ret)) return;
    const key = `${depart}_${ret}`;
    if (!out.has(key)) out.set(key, { depart, ret, nights, workdaysUsed: workdays(depart, ret, eveningStart), ...limits });
  };

  // Viaje de un día: ida y vuelta el mismo día (en días libres si solo quieres findes y puentes).
  if (dates.dayTrip) {
    const days: { d: string; limits: Pick<TripWindow, "earliest" | "latestReturn"> }[] = [];
    if (dates.ranges?.length) {
      for (const r of dates.ranges) {
        for (let d = r.from; d <= r.to; d = addDays(d, 1)) {
          days.push({ d, limits: { earliest: `${d}T${d === r.from ? (r.departAfter ?? "00:00") : "00:00"}`, latestReturn: `${d}T${d === r.to ? (r.returnBy ?? "23:59") : "23:59"}` } });
        }
      }
    } else {
      for (const m of [...dates.months].sort()) for (const d of daysOfMonth(m)) if (!dates.weekendsOnly || isFree(d)) days.push({ d, limits: {} });
    }
    for (const { d, limits } of days) {
      if (d <= today || excluded.has(d)) continue;
      out.set(`${d}_${d}`, { depart: d, ret: d, nights: 0, workdaysUsed: isFree(d) ? 0 : 1, ...limits });
    }
    return [...out.values()].sort((a, b) => a.depart.localeCompare(b.depart));
  }

  // Días concretos: cualquier ida y vuelta dentro de cada rango, respetando la hora del primer y del último día.
  if (dates.ranges?.length) {
    for (const r of dates.ranges) {
      if (r.to < r.from) continue;
      for (let d = r.from; d <= r.to; d = addDays(d, 1)) {
        for (let n = dates.minNights; n <= dates.maxNights; n++) {
          const ret = addDays(d, n);
          if (ret > r.to) break;
          // Límites del rango (también para vuelos combinados que salgan la tarde anterior).
          push(d, ret, false, { earliest: `${r.from}T${r.departAfter ?? "00:00"}`, latestReturn: `${r.to}T${r.returnBy ?? "23:59"}` });
        }
      }
    }
    return [...out.values()].sort((a, b) => a.depart.localeCompare(b.depart) || a.nights - b.nights);
  }

  const months = [...dates.months].sort();
  for (const month of months) {
    const days = daysOfMonth(month);
    if (dates.weekendsOnly) {
      for (const d of days) {
        // Inicio de bloque: día libre cuyo día anterior no es libre.
        if (!isFree(d) || isFree(addDays(d, -1))) continue;
        let end = d;
        while (isFree(addDays(end, 1))) end = addDays(end, 1);
        push(d, end, false);
        if (dates.departEveningBefore) push(addDays(d, -1), end, true);
        // También bloques más cortos dentro de un puente largo (p. ej. sábado-domingo de un puente de 4 días).
        for (let r = addDays(d, 1); r < end; r = addDays(r, 1)) push(d, r, false);
      }
    } else {
      for (const d of days) {
        for (let n = dates.minNights; n <= dates.maxNights; n++) push(d, addDays(d, n), false);
      }
    }
  }
  return [...out.values()].sort((a, b) => a.depart.localeCompare(b.depart) || a.nights - b.nights);
}

// Viaje de un día: salir a primera hora y volver por la noche (si no se eligen otras horas).
export const DAY_TRIP_TIMES = { outTo: "10:00", backFrom: "17:00" } as const;
// Valores iniciales al elegir horas concretas para el viaje de un día.
export const DAY_TRIP_DEFAULT_PLAN = { depart: "07:00", arriveHome: "23:30", flexHours: 2 } as const;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toHHMM = (m: number) => {
  const c = Math.min(23 * 60 + 59, Math.max(0, m));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
};
// Llegadas de madrugada (antes de las 04:00) cuentan como del día siguiente.
const homeMin = (t: string) => toMin(t) + (toMin(t) < 4 * 60 ? 24 * 60 : 0);
// Horas mínimas en destino para que compense ir y volver en el día.
export const DAY_TRIP_MIN_HOURS = 6;

/** Franjas horarias que se aplican a una alerta (en un viaje de un día, por defecto madrugar y volver tarde). */
export function effectiveTimes(dates: AlertConfig["dates"]): AlertConfig["dates"]["times"] {
  if (!dates.dayTrip) return dates.times;
  // Horas concretas: salida en torno a la hora elegida (± margen); la vuelta se mira por la llegada (dayTripFits).
  const plan = dates.dayTripTimes;
  if (plan) {
    const flex = plan.flexHours * 60;
    return { outFrom: toHHMM(toMin(plan.depart) - flex), outTo: toHHMM(toMin(plan.depart) + flex) };
  }
  return { ...DAY_TRIP_TIMES, ...Object.fromEntries(Object.entries(dates.times ?? {}).filter(([, v]) => v)) };
}

/**
 * Viaje de un día: ida y vuelta la misma fecha, tiempo suficiente en destino y, si se eligieron horas,
 * que el vuelo de vuelta llegue a casa en torno a la hora elegida (± margen).
 * Si una fuente no da alguna hora, no se descarta por ella.
 */
export function dayTripFits(
  o: { depart: string; ret: string; arriveTime?: string; returnTime?: string; returnArriveTime?: string; returnArriveDate?: string; durationMinutes?: number },
  dates: AlertConfig["dates"],
): boolean {
  if (!dates.dayTrip) return true;
  if (o.depart !== o.ret) return false;
  if (o.arriveTime && o.returnTime && toMin(o.returnTime) - toMin(o.arriveTime) < DAY_TRIP_MIN_HOURS * 60) return false;
  const plan = dates.dayTripTimes;
  if (!plan) return true;
  // Llegada a casa: la del horario o, si no se sabe, salida de vuelta + duración del vuelo.
  let arrive: number | undefined;
  if (o.returnArriveTime) arrive = toMin(o.returnArriveTime) + (o.returnArriveDate && o.returnArriveDate > o.ret ? 24 * 60 : 0);
  else if (o.returnTime) arrive = toMin(o.returnTime) + (o.durationMinutes ?? 120);
  if (arrive === undefined) return true;
  const target = homeMin(plan.arriveHome);
  return Math.abs(arrive - target) <= plan.flexHours * 60;
}

/** Meses que cubren unos rangos de días (para la búsqueda por meses y los festivos). */
export function monthsOfRanges(ranges: { from: string; to: string }[]): string[] {
  const months = new Set<string>();
  for (const r of ranges) for (let d = r.from; d <= r.to; d = addDays(d, 1)) months.add(d.slice(0, 7));
  return [...months].sort();
}

export function monthsOf(windows: TripWindow[]): string[] {
  return [...new Set(windows.map((w) => w.depart.slice(0, 7)))].sort();
}

export function formatDate(s: string): string {
  return parseISO(s).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
