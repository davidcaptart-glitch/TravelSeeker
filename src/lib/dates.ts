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
  const push = (depart: string, ret: string, eveningStart: boolean) => {
    const nights = diffDays(depart, ret);
    if (nights < dates.minNights || nights > dates.maxNights) return;
    if (depart <= today || excluded.has(depart) || excluded.has(ret)) return;
    const key = `${depart}_${ret}`;
    if (!out.has(key)) out.set(key, { depart, ret, nights, workdaysUsed: workdays(depart, ret, eveningStart) });
  };

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

export function monthsOf(windows: TripWindow[]): string[] {
  return [...new Set(windows.map((w) => w.depart.slice(0, 7)))].sort();
}

export function formatDate(s: string): string {
  return parseISO(s).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
