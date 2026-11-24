import { INTL_TAG, type Locale } from "./config";
import { makeT } from "./core";
import type { NsMessages } from "./messages";

/**
 * Formatos que dependen del idioma: precios, fechas, duraciones, "hace 3 h"…
 * Se obtiene con getFormat() en el servidor o useFormat() en el cliente.
 */
/** Moneda en la que se enseñan los precios y cuántas unidades vale 1 € (los precios internos van en euros). */
export type Money = { currency: string; rate: number };
const EUR: Money = { currency: "EUR", rate: 1 };

export function makeFormat(locale: Locale, common: NsMessages<"common">, money: Money = EUR) {
  const tag = INTL_TAG[locale];
  const currencyFmt = (v: number) => {
    try {
      // Sin decimales en importes grandes o en monedas sin céntimos (yen, won…).
      const nf = new Intl.NumberFormat(tag, { style: "currency", currency: money.currency });
      const digits = nf.resolvedOptions().maximumFractionDigits ?? 2;
      return new Intl.NumberFormat(tag, { style: "currency", currency: money.currency, maximumFractionDigits: v < 20 ? digits : 0, minimumFractionDigits: 0 }).format(v);
    } catch {
      return `${Math.round(v)} ${money.currency}`;
    }
  };
  const t = makeT(locale, common);
  const day = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString(tag, { ...opts, timeZone: "UTC" });
  const f = {
    locale,
    /** Un precio interno (en euros) en la moneda de la persona: "12,50 €", "US$13.60", "¥2,180"… */
    eur: (n: number) => currencyFmt(n * money.rate),
    /** Un importe que ya está en la moneda de la persona. */
    money: (v: number) => currencyFmt(v),
    currency: money.currency,
    /** Símbolo de la moneda ("€", "$", "¥", "MX$"…). */
    symbol: (() => {
      try {
        return new Intl.NumberFormat(tag, { style: "currency", currency: money.currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? money.currency;
      } catch {
        return money.currency;
      }
    })(),
    /** De euros a la moneda de la persona (redondeado) y al revés, para el presupuesto del formulario. */
    fromEur: (n: number) => Math.round(n * money.rate),
    toEur: (v: number) => Math.round((v / money.rate) * 100) / 100,
    num: (n: number, digits = 0) => new Intl.NumberFormat(tag, { maximumFractionDigits: digits }).format(n),
    /** Duración: "45 min", "2 h 10 min". */
    minutes: (m: number) => {
      if (m < 60) return t("durMin", { m });
      const h = Math.floor(m / 60);
      const r = m % 60;
      return r ? t("durHMin", { h, m: r }) : t("durH", { h });
    },
    /** Hace cuánto: "hace 3 h". */
    ago: (iso: string | null) => {
      if (!iso) return t("never");
      const s = Math.round((Date.now() - new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).getTime()) / 1000);
      if (s < 60) return t("justNow");
      if (s < 3600) return t("minutesAgo", { n: Math.round(s / 60) });
      if (s < 86400) return t("hoursAgo", { n: Math.round(s / 3600) });
      return t("daysAgo", { n: Math.round(s / 86400) });
    },
    /** Fecha corta con día de la semana: "vie, 12 dic". */
    date: (d: string) => day(d, { weekday: "short", day: "numeric", month: "short" }),
    /** Día y mes: "12 dic". */
    day: (d: string) => day(d, { day: "numeric", month: "short" }),
    /** Mes y año ("2026-12"): "dic 26". */
    month: (m: string) => day(`${m}-01`, { month: "short", year: "2-digit" }),
    /** Mes largo ("2026-12"): "diciembre de 2026". */
    monthLong: (m: string) => day(`${m}-01`, { month: "long", year: "numeric" }),
    stops: (n: number) => t(n <= 0 ? "stops0" : n === 1 ? "stops1" : "stops2"),
    nights: (n: number) => (n === 0 ? t("sameDay") : t("nights", { n })),
    /** Resumen de las fechas de una alerta: rangos de días o meses. */
    datesLabel: (dates: { months: string[]; dayTrip?: boolean; ranges?: { from: string; to: string; departAfter?: string; returnBy?: string }[] }): string => {
      const base = dates.ranges?.length
        ? dates.ranges.map((r) => `${f.day(r.from)}${r.departAfter ? ` ${r.departAfter}` : ""} – ${f.day(r.to)}${r.returnBy ? ` ${r.returnBy}` : ""}`).join(", ")
        : dates.months.map(f.month).join(", ");
      return dates.dayTrip ? `${t("dayTripPrefix")} · ${base}` : base;
    },
    /** Nombre de un país en este idioma ("FR" → "Francia"). */
    country: (code: string) => {
      try {
        return new Intl.DisplayNames([tag], { type: "region" }).of(code) ?? code;
      } catch {
        return code;
      }
    },
    /** Lista con "y"/"and" según el idioma. */
    list: (items: string[]) => {
      try {
        return new Intl.ListFormat(tag, { style: "long", type: "conjunction" }).format(items);
      } catch {
        return items.join(", ");
      }
    },
  };
  return f;
}

export type Format = ReturnType<typeof makeFormat>;
