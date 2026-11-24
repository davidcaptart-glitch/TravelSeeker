export function eur(n: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: n < 20 ? 2 : 0 }).format(n);
}

export function minutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function ago(iso: string | null): string {
  if (!iso) return "nunca";
  const s = Math.round((Date.now() - new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).getTime()) / 1000);
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} días`;
}

export function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("es-ES", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export const STOPS_LABEL = ["Directo", "Máx. 1 escala", "Máx. 2 escalas"];

function dayLabel(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Resumen corto de las fechas de una alerta: rangos de días concretos o meses. */
export function datesLabel(dates: {
  months: string[];
  dayTrip?: boolean;
  ranges?: { from: string; to: string; departAfter?: string; returnBy?: string }[];
}): string {
  if (dates.dayTrip) return `En el día · ${datesLabel({ ...dates, dayTrip: false })}`;
  if (dates.ranges?.length) {
    return dates.ranges
      .map((r) => `${dayLabel(r.from)}${r.departAfter ? ` ${r.departAfter}` : ""} – ${dayLabel(r.to)}${r.returnBy ? ` ${r.returnBy}` : ""}`)
      .join(", ");
  }
  return dates.months.map(monthLabel).join(", ");
}
