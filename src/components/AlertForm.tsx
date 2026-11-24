"use client";

import { ArrowLeft, ArrowRight, Bed, Building2, CalendarRange, Check, ChevronDown, Compass, History, Home, Hotel, Loader2, MapPin, Minus, Plane, Plus, Sunrise, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { saveAlert, type FormState } from "@/app/actions";
import { addDays, DAY_TRIP_DEFAULT_PLAN, DAY_TRIP_TIMES, generateWindows, monthsOfRanges } from "@/lib/dates";
import { SURPRISE_COUNTRIES } from "@/lib/countries";
import { DESTINATION_THEMES, HOTEL_TYPES, parseTripadvisorGeo, REGIONS, type AlertConfig, type Place } from "@/lib/types";
import { INTL_TAG } from "@/i18n/config";
import { useFormat, useT } from "@/i18n/client";
import type { Translator } from "@/i18n/core";
import type { Format } from "@/i18n/format";
import type { NsMessages } from "@/i18n/messages";
import { AirportMultiPicker, DateList, NearbyAirports, PlacePicker } from "./pickers";

type T = Translator<NsMessages<"alertForm">>;

type Draft = Omit<AlertConfig, "destination" | "hotel"> & {
  destKind: "place" | "anywhere";
  place?: Place;
  themes: (typeof DESTINATION_THEMES)[number][];
  countries: string[];
  regions: (typeof REGIONS)[number][];
  excludeCountries: string[];
  hotelOn: boolean;
  hotel: NonNullable<AlertConfig["hotel"]>;
};

function nextMonths(today: string, n: number): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 7));
}

function fromConfig(today: string, c?: AlertConfig): Draft {
  return {
    name: c?.name ?? "",
    notifyMode: c?.notifyMode ?? "flight",
    origins: c?.origins ?? [],
    destKind: c?.destination.kind ?? "place",
    place: c?.destination.kind === "place" ? c.destination.place : undefined,
    themes: c?.destination.kind === "anywhere" ? c.destination.themes : [],
    countries: c?.destination.kind === "anywhere" ? c.destination.countries : [],
    regions: c?.destination.kind === "anywhere" ? (c.destination.regions ?? []) : [],
    excludeCountries: c?.destination.kind === "anywhere" ? (c.destination.excludeCountries ?? []) : [],
    destinationAirports: c?.destinationAirports ?? [],
    airportRadiusKm: c?.airportRadiusKm ?? 150,
    allowGround: c?.allowGround ?? false,
    maxGroundMinutes: c?.maxGroundMinutes ?? 240,
    groundFrom: c?.groundFrom,
    dates: c?.dates ?? {
      months: nextMonths(today, 3).slice(1),
      weekendsOnly: true,
      extraDaysOff: [],
      excludeDates: [],
      useHolidays: true,
      departEveningBefore: true,
      minNights: 1,
      maxNights: 4,
    },
    flight: c?.flight ?? { maxPrice: 150, maxStops: 1, passengers: 1 },
    hotelOn: Boolean(c?.hotel),
    hotel: c?.hotel ?? {
      types: ["hotel", "apartment"],
      maxPricePerNight: 90,
      minRating: 4,
    },
    checkEveryHours: c?.checkEveryHours ?? 6,
  };
}

function suggestedName(d: Draft, t: T, f: Format): string {
  if (d.destKind === "place") {
    if (!d.place) return "";
    const place = d.place.label.split(",")[0];
    return d.dates.dayTrip ? t("nameDayTrip", { place }) : t("nameTrip", { place });
  }
  return d.themes.length ? t("nameThemes", { themes: f.list(d.themes.map((x) => t(`theme_${x}` as const))) }) : t("nameSurprise");
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
// Hora del reloj (da la vuelta a medianoche): 25:00 → 01:00.
const clock = (m: number) => {
  const c = ((m % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(c / 60))}:${pad2(c % 60)}`;
};

/** Franja de ida y de llegada a casa del viaje de un día con el margen elegido. */
function dayTripWindows(p: NonNullable<AlertConfig["dates"]["dayTripTimes"]>) {
  const flex = p.flexHours * 60;
  const dep = toMin(p.depart);
  const home = toMin(p.arriveHome);
  return {
    a: clock(Math.max(0, dep - flex)),
    b: clock(Math.min(1439, dep + flex)),
    c: clock(home - flex),
    d: clock(home + flex),
  };
}

function toConfig(d: Draft, dates: AlertConfig["dates"], t: T, f: Format): AlertConfig {
  return {
    name: (d.name.trim() || suggestedName(d, t, f)).slice(0, 80),
    notifyMode: dates.dayTrip ? "flight" : d.notifyMode,
    origins: d.origins,
    destination:
      d.destKind === "place"
        ? { kind: "place", place: d.place! }
        : {
            kind: "anywhere",
            themes: d.themes,
            countries: d.countries,
            regions: d.regions,
            excludeCountries: d.excludeCountries.filter((c) => !d.countries.includes(c)),
          },
    destinationAirports: d.destKind === "place" ? d.destinationAirports : [],
    airportRadiusKm: d.airportRadiusKm,
    allowGround: d.allowGround,
    maxGroundMinutes: d.maxGroundMinutes,
    groundFrom: d.allowGround ? d.groundFrom : undefined,
    dates,
    flight: d.flight,
    hotel: d.hotelOn && !dates.dayTrip
      ? {
          ...d.hotel,
          tripadvisorGeo: d.destKind === "place" ? d.hotel.tripadvisorGeo : undefined,
        }
      : undefined,
    checkEveryHours: d.checkEveryHours,
  };
}

const HOTEL_ICON = { hotel: Hotel, apartment: Home, hostel: Building2 };

// Pasos del asistente (títulos y preguntas en alertForm: step0…3, lead0…3).
const STEPS = [0, 1, 2, 3] as const;

/* ---------- Controles ---------- */

/** Elegir países por su nombre: los elegidos salen como chips que se quitan con la ✕. */
function CountryPicker({
  id,
  value,
  onChange,
  placeholder,
  suggest,
}: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  suggest?: string;
}) {
  const t = useT("alertForm");
  const f = useFormat();
  const options = useMemo(
    () => ([...SURPRISE_COUNTRIES] as string[]).sort((a, b) => f.country(a).localeCompare(f.country(b), f.locale)),
    [f],
  );
  const countryName = f.country;
  const free = options.filter((c) => !value.includes(c));
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((c) => (
            <button
              key={c}
              type="button"
              className="chip chip-on"
              aria-label={t("removeX", { name: countryName(c) })}
              onClick={() => onChange(value.filter((x) => x !== c))}
            >
              {countryName(c)}
              <X className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={id}
          className="input min-w-0 flex-1"
          value=""
          onChange={(e) => e.target.value && onChange([...value, e.target.value])}
        >
          <option value="">{placeholder}</option>
          {free.map((c) => (
            <option key={c} value={c}>
              {countryName(c)}
            </option>
          ))}
        </select>
        {suggest && free.includes(suggest) && (
          <button type="button" className="chip" onClick={() => onChange([...value, suggest])}>
            <Plus className="h-3.5 w-3.5" />
            {countryName(suggest)}
          </button>
        )}
      </div>
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4">
      <div>
        <h3 className="font-semibold">{title}</h3>
        {hint && <p className="hint mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="hint block">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-border transition peer-checked:bg-accent peer-focus-visible:ring-4 peer-focus-visible:ring-accent/25 after:absolute after:top-1 after:start-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5 rtl:peer-checked:after:-translate-x-5"
      />
    </label>
  );
}

type DateRange = NonNullable<AlertConfig["dates"]["ranges"]>[number];
type Times = NonNullable<AlertConfig["dates"]["times"]>;

/** Próximo viernes → domingo, como primer rango de ejemplo. */
function nextWeekend(today: string): DateRange {
  let d = addDays(today, 1);
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 5) d = addDays(d, 1);
  return { from: d, to: addDays(d, 2), departAfter: "16:00" };
}

function TimeInput({
  value,
  onChange,
  label,
  id,
  clearable = true,
}: {
  value?: string;
  onChange: (v?: string) => void;
  label: string;
  id: string;
  clearable?: boolean;
}) {
  const t = useT("alertForm");
  return (
    <div className="flex min-w-0 items-center gap-1">
      <input
        id={id}
        type="time"
        className="input min-w-0 flex-1 px-3"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        aria-label={label}
      />
      {clearable && (
        <button
          type="button"
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-foreground ${value ? "" : "invisible"}`}
          onClick={() => onChange(undefined)}
          aria-label={t("removeX", { name: label })}
          tabIndex={value ? 0 : -1}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Rangos de días concretos: "libre desde el viernes 17:00 hasta el domingo 22:00". Se pueden añadir varios. */
function RangeEditor({ value, onChange, today }: { value: DateRange[]; onChange: (v: DateRange[]) => void; today: string }) {
  const t = useT("alertForm");
  const set = (i: number, patch: Partial<DateRange>) =>
    onChange(
      value.map((r, j) => {
        if (j !== i) return r;
        const n = { ...r, ...patch };
        // El final nunca antes que el principio.
        if (n.to < n.from) n.to = n.from;
        return n;
      }),
    );
  const min = addDays(today, 1);
  return (
    <div className="space-y-3">
      {value.map((r, i) => (
        <div key={i} className="rounded-2xl bg-surface-2/60 p-3" style={{ boxShadow: "inset 0 0 0 1px var(--hairline)" }}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">
              <CalendarRange className="me-1.5 inline h-4 w-4 text-cyan" />
              {value.length > 1 ? t("rangeN", { n: i + 1 }) : t("yourDays")}
            </p>
            {value.length > 1 && (
              <button type="button" className="btn-quiet min-h-8 px-2 text-xs" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <Trash2 className="h-3.5 w-3.5" /> {t("remove")}
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="label mb-0" htmlFor={`from-${i}`}>
                {t("from")}
              </label>
              <input id={`from-${i}`} type="date" className="input" min={min} value={r.from} onChange={(e) => e.target.value && set(i, { from: e.target.value })} />
              <div className="flex items-center gap-2">
                <span className="hint flex-1">{t("notBefore")}</span>
                <div className="w-44 shrink-0">
                  <TimeInput id={`from-time-${i}`} label={t("minDepartTime")} value={r.departAfter} onChange={(v) => set(i, { departAfter: v })} />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="label mb-0" htmlFor={`to-${i}`}>
                {t("to")}
              </label>
              <input id={`to-${i}`} type="date" className="input" min={r.from} value={r.to} onChange={(e) => e.target.value && set(i, { to: e.target.value })} />
              <div className="flex items-center gap-2">
                <span className="hint flex-1">{t("backBy")}</span>
                <div className="w-44 shrink-0">
                  <TimeInput id={`to-time-${i}`} label={t("returnLimitTime")} value={r.returnBy} onChange={(v) => set(i, { returnBy: v })} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn-ghost w-full"
        onClick={() => {
          const last = value.at(-1);
          onChange([...value, last ? { from: addDays(last.from, 7), to: addDays(last.to, 7), departAfter: last.departAfter, returnBy: last.returnBy } : nextWeekend(today)]);
        }}
      >
        <Plus className="h-4 w-4" /> {t("addRange")}
      </button>
    </div>
  );
}

const TIME_PRESETS = [
  { label: "presetNoEarly", patch: { outFrom: "08:00", backFrom: "08:00" } },
  { label: "presetAfterWork", patch: { outFrom: "17:00" } },
  { label: "presetAfternoonBack", patch: { backFrom: "15:00" } },
] as const satisfies readonly { label: string; patch: Times }[];

function TimesEditor({ value, onChange }: { value: Times; onChange: (v: Times) => void }) {
  const t = useT("alertForm");
  const set = (patch: Times) => onChange({ ...value, ...patch });
  const row = (title: string, from: "outFrom" | "backFrom", to: "outTo" | "backTo") => (
    <div>
      <p className="label">{title}</p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TimeInput id={from} label={t("timeFrom", { label: title })} value={value[from]} onChange={(v) => set({ [from]: v })} />
        <span className="text-sm text-muted">{t("timeSep")}</span>
        <TimeInput id={to} label={t("timeTo", { label: title })} value={value[to]} onChange={(v) => set({ [to]: v })} />
      </div>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TIME_PRESETS.map((p) => (
          <button key={p.label} type="button" className="chip" onClick={() => set(p.patch)}>
            {t(p.label)}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {row(t("outDeparture"), "outFrom", "outTo")}
        {row(t("backDeparture"), "backFrom", "backTo")}
      </div>
      <p className="hint">{t("timesHint")}</p>
    </div>
  );
}

function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, string])[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-2xl bg-surface-2 p-1">
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`min-h-10 flex-1 rounded-xl px-2 text-sm font-medium transition ${value === v ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Stepper({
  value,
  onChange,
  min,
  max,
  label,
  unit,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  label: string;
  unit?: (n: number) => string;
}) {
  const t = useT("alertForm");
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-border p-1">
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-xl hover:bg-surface-2 disabled:opacity-30"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={t("less", { label })}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="text-base font-semibold tabular-nums" aria-live="polite">
          {value}
          {unit ? <span className="ms-1 text-sm font-normal text-muted">{unit(value)}</span> : null}
        </span>
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-xl hover:bg-surface-2 disabled:opacity-30"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={t("more", { label })}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

type HistoryInfo = {
  stats: { samples: number; days: number; since: string; min: number; p25: number; median: number; minDepart: string } | null;
  budgetShare?: number | null;
  market: { month: string; price: number } | null;
};

/**
 * Lo que ya sabemos de la ruta mientras creas la alerta: histórico guardado de todas las búsquedas
 * (más barato visto, buen precio, lo normal y cuántos precios entran en tu presupuesto) o, si aún no
 * hay, lo más barato del mercado en tus meses.
 */
function RouteHistoryHint({ d, dates }: { d: Draft; dates: AlertConfig["dates"] }) {
  const t = useT("alertForm");
  const f = useFormat();
  const [info, setInfo] = useState<HistoryInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const params = useMemo(() => {
    if (d.destKind !== "place" || !d.place || !d.origins.length || !dates.months.length) return null;
    const p = new URLSearchParams({
      origins: d.origins.join(","),
      months: dates.months.join(","),
      minNights: String(dates.dayTrip ? 0 : dates.minNights),
      maxNights: String(dates.dayTrip ? 0 : dates.maxNights),
      maxStops: String(d.flight.maxStops),
      budget: String(d.flight.maxPrice),
    });
    if (d.destinationAirports.length) p.set("dests", d.destinationAirports.join(","));
    else {
      p.set("lat", String(d.place.lat));
      p.set("lon", String(d.place.lon));
      p.set("radius", String(d.airportRadiusKm));
    }
    return p.toString();
  }, [d.destKind, d.place, d.origins, d.destinationAirports, d.airportRadiusKm, d.flight.maxStops, d.flight.maxPrice, dates]);

  useEffect(() => {
    if (!params) return;
    const ctrl = new AbortController();
    // Espera un poco mientras se mueve el presupuesto, para no pedirlo en cada paso.
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/history?${params}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((j: HistoryInfo) => setInfo(j))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 450);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [params]);

  if (!params) return null;
  const budget = d.flight.maxPrice;
  const s = info?.stats;
  const roundUp = (n: number) => Math.ceil(n / 10) * 10;
  return (
    <section className="rounded-2xl bg-surface-2 p-3.5" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <History className="h-4 w-4 text-accent" /> {t("histTitle")}
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
      </p>
      {s ? (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {[
              [t("histMin"), s.min],
              [t("histGood"), s.p25],
              [t("histTypical"), s.median],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-xl bg-surface p-2">
                <p className="hint truncate">{label}</p>
                <p className="font-bold tabular-nums">{f.eur(Number(value))}</p>
              </div>
            ))}
          </div>
          <p className={`text-sm ${budget < s.min ? "text-warn" : ""}`}>
            {budget < s.min
              ? t("histBelowAll", { budget: f.eur(budget), suggest: f.eur(roundUp(s.p25)) })
              : info?.budgetShare != null
                ? t("histBudget", { budget: f.eur(budget), pct: Math.round(info.budgetShare * 100) })
                : ""}
          </p>
          <p className="hint">{t("histSamples", { samples: f.num(s.samples), since: f.day(s.since) })}</p>
        </div>
      ) : info?.market ? (
        <p className={`mt-1 text-sm ${budget < info.market.price ? "text-warn" : "text-muted"}`}>
          {t("histMarket", { price: f.eur(info.market.price), month: f.monthLong(info.market.month) })}
          {budget < info.market.price ? ` ${t("histMarketLow", { suggest: f.eur(roundUp(info.market.price * 1.1)) })}` : ""}
        </p>
      ) : (
        !loading && info && <p className="hint mt-1">{t("histNone")}</p>
      )}
    </section>
  );
}

/**
 * Importe en la moneda de la persona. El valor que se guarda va en euros (lo que comparan las búsquedas):
 * aquí se enseña y se escribe convertido con el cambio del día.
 */
function Money({
  id,
  label,
  value,
  onChange,
  min = 0,
  max,
  suffix,
}: {
  id: string;
  label: string;
  // En euros.
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max: number;
  suffix?: string;
}) {
  const t = useT("alertForm");
  const f = useFormat();
  const local = value === undefined ? undefined : f.fromEur(value);
  const lo = f.fromEur(min);
  const hi = f.fromEur(max);
  // Paso del deslizador proporcional a la moneda (5 € ≈ 5 $, ≈ 1.000 ¥…), redondeado a 1, 2 o 5 × 10ⁿ.
  const raw = Math.max(1, (hi - lo) / 400);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((k) => k * pow).find((s) => s >= raw) ?? pow * 10;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={lo}
          className="input pe-20 text-lg font-semibold tabular-nums"
          value={local ?? ""}
          placeholder={t("noLimit")}
          onChange={(e) => {
            const v = num(e.target.value);
            onChange(v === undefined ? undefined : f.toEur(v));
          }}
        />
        <span className="pointer-events-none absolute top-1/2 end-3.5 -translate-y-1/2 text-sm text-muted">
          {f.symbol}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={lo}
        max={hi}
        step={step}
        value={Math.min(local ?? hi, hi)}
        onChange={(e) => onChange(f.toEur(Number(e.target.value)))}
        className="mt-3 w-full accent-[var(--accent)]"
        aria-label={label}
      />
    </div>
  );
}

/** Nombres cortos de los 12 meses en el idioma de la interfaz. */
function monthNames(tag: string): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(2000, i, 1)).toLocaleDateString(tag, { month: "short", timeZone: "UTC" }).replace(".", ""),
  );
}
// Las aerolíneas suelen vender billetes con unos 11 meses de antelación.
const ON_SALE_MONTHS = 11;

/** Selector de meses por año: pestañas de año, sus 12 meses y "todo el año". */
function MonthPicker({ today, value, onChange }: { today: string; value: string[]; onChange: (v: string[]) => void }) {
  const t = useT("alertForm");
  const f = useFormat();
  const MONTH_NAMES = useMemo(() => monthNames(INTL_TAG[f.locale]), [f.locale]);
  const thisYear = Number(today.slice(0, 4));
  const thisMonth = today.slice(0, 7);
  const years = [thisYear, thisYear + 1, thisYear + 2];
  const [year, setYear] = useState(() => Number((value.find((m) => m >= thisMonth) ?? thisMonth).slice(0, 4)));
  const months = MONTH_NAMES.map((_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const open = months.filter((m) => m >= thisMonth);
  const allOn = open.length > 0 && open.every((m) => value.includes(m));
  const lastOnSale = nextMonths(today, ON_SALE_MONTHS + 1).at(-1)!;
  const farAway = value.filter((m) => m > lastOnSale);
  const toggle = (m: string) => onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m].sort());

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label={t("year")} className="flex rounded-2xl bg-surface-2 p-1">
        {years.map((y) => {
          const n = value.filter((m) => m.startsWith(`${y}-`)).length;
          return (
            <button
              key={y}
              type="button"
              role="tab"
              aria-selected={year === y}
              onClick={() => setYear(y)}
              className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold tabular-nums transition ${year === y ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
            >
              {y}
              {n > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] text-accent-ink">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {months.map((m, i) => {
          const on = value.includes(m);
          const past = m < thisMonth;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              disabled={past}
              className={`chip justify-center capitalize disabled:cursor-not-allowed disabled:opacity-35 ${on ? "chip-on" : ""}`}
              onClick={() => toggle(m)}
            >
              {MONTH_NAMES[i]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="text-sm font-medium text-accent disabled:opacity-40"
          disabled={!open.length}
          onClick={() => onChange(allOn ? value.filter((m) => !months.includes(m)) : [...new Set([...value, ...open])].sort())}
        >
          {allOn ? t("removeAllYear", { year }) : t("allYear", { year })}
        </button>
        {value.length > 0 && (
          <button type="button" className="text-sm text-muted hover:text-foreground" onClick={() => onChange([])}>
            {t("clearSelection")}
          </button>
        )}
      </div>

      {value.length > 0 && (
        <p className="text-sm">
          <span className="text-muted">{t("chosen")} </span>
          <span className="font-medium">
            {years
              .map((y) => {
                const sel = value.filter((m) => m.startsWith(`${y}-`));
                if (!sel.length) return "";
                const open = MONTH_NAMES.map((_, i) => `${y}-${String(i + 1).padStart(2, "0")}`).filter((m) => m >= thisMonth);
                return `${y}: ${open.every((m) => sel.includes(m)) ? t("wholeYear") : f.list(sel.map((m) => MONTH_NAMES[Number(m.slice(5)) - 1]))}`;
              })
              .filter(Boolean)
              .join(" · ")}
          </span>
        </p>
      )}
      {farAway.length > 0 && (
        <p className="rounded-2xl bg-surface-2 px-3 py-2 text-xs text-muted">
          {t("farAway", { n: ON_SALE_MONTHS, months: f.list(farAway.map(f.month)) })}
        </p>
      )}
    </div>
  );
}

function More({ children, label }: { children: React.ReactNode; label?: string }) {
  const t = useT("alertForm");
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-accent">
        {label ?? t("moreOptions")}
        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

/** La primera búsqueda consulta muchas fechas y puede tardar cerca de un minuto: que se vea que está trabajando. */
export function SearchingOverlay() {
  // Si la búsqueda sale de la caché tarda milisegundos: solo se muestra si de verdad hay que esperar.
  const t = useT("alertForm");
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 500);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-background/80 p-6 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="card animate-rise max-w-xs text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Plane className="h-7 w-7 animate-pulse" />
        </span>
        <p className="mt-4 font-semibold">{t("searchingTitle")}</p>
        <p className="mt-1 text-sm text-muted">{t("searchingBody")}</p>
        <Loader2 className="mx-auto mt-4 h-5 w-5 animate-spin text-muted" />
      </div>
    </div>
  );
}

function num(v: string): number | undefined {
  const n = Number(v);
  return v === "" || Number.isNaN(n) ? undefined : n;
}

/* ---------- Formulario ---------- */

export function AlertForm({ id, initial, today }: { id?: string; initial?: AlertConfig; today: string }) {
  const t = useT("alertForm");
  const f = useFormat();
  const [d, setD] = useState<Draft>(() => {
    const draft = fromConfig(today, initial);
    if (initial) return draft;
    // Alerta nueva: los presupuestos por defecto, redondeados en tu moneda (150 € → 160 US$, 26.000 ¥…).
    const nice = (eur: number) => {
      const v = f.fromEur(eur);
      const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, v))) - 1);
      return f.toEur(Math.round(v / p) * p);
    };
    return {
      ...draft,
      flight: { ...draft.flight, maxPrice: nice(draft.flight.maxPrice) },
      hotel: { ...draft.hotel, maxPricePerNight: draft.hotel.maxPricePerNight && nice(draft.hotel.maxPricePerNight) },
    };
  });
  const [state, action, pending] = useActionState<FormState, FormData>(saveAlert, undefined);
  const [step, setStep] = useState(0);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const setDates = (patch: Partial<Draft["dates"]>) => setD((p) => ({ ...p, dates: { ...p.dates, ...patch } }));
  const setFlight = (patch: Partial<Draft["flight"]>) => setD((p) => ({ ...p, flight: { ...p.flight, ...patch } }));
  const setHotel = (patch: Partial<Draft["hotel"]>) => setD((p) => ({ ...p, hotel: { ...p.hotel, ...patch } }));
  // Texto tal cual lo pega el usuario (enlace o código); en la alerta se guarda solo el código.
  const [taText, setTaText] = useState(d.hotel.tripadvisorGeo ?? "");

  // Por meses o por días concretos (rangos). Los meses de la alerta se sacan de los rangos.
  const [dateMode, setDateMode] = useState<"months" | "ranges">(d.dates.ranges?.length ? "ranges" : "months");
  const [timesOn, setTimesOn] = useState(Boolean(d.dates.times && Object.values(d.dates.times).some(Boolean)));
  const dates = useMemo<AlertConfig["dates"]>(() => {
    const times = timesOn && d.dates.times && Object.values(d.dates.times).some(Boolean) ? d.dates.times : undefined;
    // En un viaje de un día no se sale la tarde anterior (las noches no cuentan).
    // Si se eligieron horas del viaje de un día, sustituyen a las franjas horarias generales.
    if (d.dates.dayTrip) {
      const plan = d.dates.dayTripTimes;
      const base = { ...d.dates, times: plan ? undefined : times, dayTripTimes: plan, departEveningBefore: false };
      if (dateMode === "ranges") {
        const ranges = (d.dates.ranges ?? []).filter((r) => r.from && r.to && r.to >= r.from);
        return { ...base, ranges, months: monthsOfRanges(ranges) };
      }
      return { ...base, ranges: undefined };
    }
    if (dateMode === "ranges") {
      const ranges = (d.dates.ranges ?? []).filter((r) => r.from && r.to && r.to >= r.from);
      return { ...d.dates, ranges, times, dayTripTimes: undefined, months: monthsOfRanges(ranges) };
    }
    return { ...d.dates, ranges: undefined, times, dayTripTimes: undefined };
  }, [d.dates, dateMode, timesOn]);

  // Festivos del usuario para previsualizar las fechas exactas que se buscarán.
  const years = [...new Set(dates.months.map((m) => m.slice(0, 4)))].join(",");
  const [holidays, setHolidays] = useState<string[]>([]);
  useEffect(() => {
    if (!years) return;
    fetch(`/api/holidays?years=${years}`)
      .then((r) => r.json())
      .then((j: { dates: string[] }) => setHolidays(j.dates))
      .catch(() => {});
  }, [years]);
  const windows = useMemo(() => generateWindows(dates, new Set(dates.useHolidays ? holidays : []), today), [dates, holidays, today]);

  const stepOk = [
    d.origins.length > 0 && (d.destKind === "anywhere" || Boolean(d.place)),
    dates.months.length > 0 && windows.length > 0,
    d.flight.maxPrice > 0 && (!d.hotelOn || d.dates.dayTrip || d.hotel.types.length > 0),
    true,
  ];
  const missing = [
    !d.origins.length ? t("missingOrigin") : t("missingDest"),
    !dates.months.length
      ? dateMode === "ranges"
        ? t("missingRanges")
        : t("missingMonths")
      : t("noDatesPossible"),
    t("missingPrice"),
    "",
  ];
  const ready = stepOk.every(Boolean);
  const isLast = step === STEPS.length - 1;
  const plan = d.dates.dayTrip ? d.dates.dayTripTimes : undefined;
  const planWin = plan ? dayTripWindows(plan) : undefined;
  const themeLabel = (x: (typeof DESTINATION_THEMES)[number]) => t(`theme_${x}` as const);
  const hotelLabel = (x: (typeof HOTEL_TYPES)[number]) => t(`hotelType_${x}` as const);
  const canReach = (i: number) => Boolean(id) || stepOk.slice(0, i).every(Boolean);

  function go(i: number) {
    setStep(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <form
      action={action}
      className="space-y-5"
      // Intro en un buscador no debe enviar el formulario a medias.
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
    >
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="config" value={JSON.stringify(ready ? toConfig(d, dates, t, f) : {})} />

      {/* Progreso */}
      <nav aria-label={t("stepsNav")} className="space-y-3">
        <ol className="grid grid-cols-4 gap-1.5">
          {STEPS.map((i) => (
            <li key={i}>
              <button
                type="button"
                disabled={!canReach(i)}
                onClick={() => go(i)}
                aria-current={step === i ? "step" : undefined}
                className="group w-full text-start disabled:cursor-not-allowed"
              >
                <span className={`block h-1.5 rounded-full transition ${i <= step ? "bg-accent" : "bg-border"}`} />
                <span className={`mt-1.5 block truncate text-xs font-medium ${step === i ? "text-foreground" : "text-muted"}`}>
                  {i + 1}. {t(`step${i}`)}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <h2 className="text-xl font-semibold tracking-tight">{t(`lead${STEPS[step]}`)}</h2>
      </nav>

      <div key={step} className="animate-rise space-y-4">
        {step === 0 && (
          <>
            <Block title={t("fromTitle")} hint={t("fromHint")}>
              <AirportMultiPicker value={d.origins} onChange={(v) => set("origins", v)} />
            </Block>

            <Block title={t("destTitle")}>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["place", MapPin, t("destPlace"), t("destPlaceHint")],
                    ["anywhere", Compass, t("destAnywhere"), t("destAnywhereHint")],
                  ] as const
                ).map(([v, Icon, title, h]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={d.destKind === v}
                    onClick={() => set("destKind", v)}
                    className={`rounded-2xl border p-3 text-start transition ${d.destKind === v ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}
                  >
                    <Icon className={`mb-2 h-5 w-5 ${d.destKind === v ? "text-accent" : "text-muted"}`} />
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="hint">{h}</span>
                  </button>
                ))}
              </div>

              {d.destKind === "place" ? (
                <div className="space-y-4">
                  <PlacePicker
                    value={d.place}
                    onChange={(p) => setD((x) => ({ ...x, place: p, destinationAirports: [] }))}
                    placeholder={t("placeExamples")}
                  />
                  {d.place && (
                    <>
                      <div>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="label">{t("arrivalAirports")}</p>
                          <span className="text-sm text-muted tabular-nums">{t("upToKm", { km: d.airportRadiusKm })}</span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={400}
                          step={10}
                          value={d.airportRadiusKm}
                          onChange={(e) => set("airportRadiusKm", Number(e.target.value))}
                          className="mb-3 w-full accent-[var(--accent)]"
                          aria-label={t("airportDistance")}
                        />
                        <NearbyAirports
                          place={d.place}
                          radiusKm={d.airportRadiusKm}
                          value={d.destinationAirports}
                          onChange={(v) => set("destinationAirports", v)}
                        />
                        <p className="hint mt-2">
                          {d.destinationAirports.length
                            ? t("onlyAirports", { list: f.list(d.destinationAirports) })
                            : t("nearestAirports")}
                        </p>
                      </div>
                      <div className="border-t border-border pt-3">
                        <Switch
                          checked={d.allowGround}
                          onChange={(v) => set("allowGround", v)}
                          label={t("groundLabel")}
                          hint={t("groundHint")}
                        />
                        {d.allowGround && (
                          <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            <div>
                              <p className="label">{t("groundMax")}</p>
                              <Segmented
                                label={t("groundMaxShort")}
                                value={d.maxGroundMinutes}
                                onChange={(v) => set("maxGroundMinutes", v)}
                                options={[60, 120, 240, 360].map((m) => [m, `${m / 60} h`] as const)}
                              />
                            </div>
                            <div>
                              <p className="label">{t("groundFrom")}</p>
                              <PlacePicker value={d.groundFrom} onChange={(p) => set("groundFrom", p)} placeholder={t("groundFromExamples")} />
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="label">{t("themesTitle")}</p>
                    <div className="flex flex-wrap gap-2">
                      {DESTINATION_THEMES.map((th) => {
                        const on = d.themes.includes(th);
                        return (
                          <button
                            key={th}
                            type="button"
                            aria-pressed={on}
                            className={`chip capitalize ${on ? "chip-on" : ""}`}
                            onClick={() => set("themes", on ? d.themes.filter((x) => x !== th) : [...d.themes, th])}
                          >
                            {on && <Check className="h-3.5 w-3.5" />}
                            {themeLabel(th)}
                          </button>
                        );
                      })}
                    </div>
                    <p className="hint mt-2">{t("themesHint")}</p>
                  </div>
                  <div>
                    <p className="label">{t("continents")}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        aria-pressed={d.regions.length === 0}
                        className={`chip ${d.regions.length === 0 ? "chip-on" : ""}`}
                        onClick={() => set("regions", [])}
                      >
                        {d.regions.length === 0 && <Check className="h-3.5 w-3.5" />}
                        {t("allWorld")}
                      </button>
                      {REGIONS.map((r) => {
                        const on = d.regions.includes(r);
                        return (
                          <button
                            key={r}
                            type="button"
                            aria-pressed={on}
                            className={`chip ${on ? "chip-on" : ""}`}
                            onClick={() => set("regions", on ? d.regions.filter((x) => x !== r) : [...d.regions, r])}
                          >
                            {on && <Check className="h-3.5 w-3.5" />}
                            {t(`region_${r}`)}
                          </button>
                        );
                      })}
                    </div>
                    <p className="hint mt-2">{t("continentsHint")}</p>
                  </div>
                  <div>
                    <label className="label" htmlFor="exclude-countries">
                      {t("excludeCountries")}
                    </label>
                    <CountryPicker
                      id="exclude-countries"
                      value={d.excludeCountries}
                      onChange={(v) => {
                        set("excludeCountries", v);
                        set("countries", d.countries.filter((c) => !v.includes(c)));
                      }}
                      placeholder={t("excludePlaceholder")}
                      suggest="ES"
                    />
                    <p className="hint mt-2">{t("excludeHint")}</p>
                  </div>
                  <div>
                    <label className="label" htmlFor="countries">
                      {t("onlyCountries")}
                    </label>
                    <CountryPicker
                      id="countries"
                      value={d.countries}
                      onChange={(v) => {
                        set("countries", v);
                        set("excludeCountries", d.excludeCountries.filter((c) => !v.includes(c)));
                      }}
                      placeholder={t("anyCountry")}
                    />
                  </div>
                </div>
              )}
            </Block>
          </>
        )}

        {step === 1 && (
          <>
            <button
              type="button"
              aria-pressed={Boolean(d.dates.dayTrip)}
              onClick={() => setDates({ dayTrip: !d.dates.dayTrip })}
              className={`flex w-full gap-3 rounded-2xl border p-3 text-start transition ${d.dates.dayTrip ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}
            >
              <Sunrise className={`mt-0.5 h-5 w-5 shrink-0 ${d.dates.dayTrip ? "text-accent" : "text-muted"}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t("dayTrip")}</span>
                <span className="hint">{t("dayTripHint")}</span>
              </span>
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${d.dates.dayTrip ? "border-accent bg-accent text-white" : "border-border"}`}>
                {d.dates.dayTrip && <Check className="h-3.5 w-3.5" />}
              </span>
            </button>

            {d.dates.dayTrip && (
              <Block title={t("dtTitle")}>
                <Switch
                  checked={Boolean(plan)}
                  onChange={(v) => setDates({ dayTripTimes: v ? { ...DAY_TRIP_DEFAULT_PLAN } : undefined })}
                  label={t("dtChooseHours")}
                  hint={plan ? undefined : t("dtDefaultHint", { outTo: DAY_TRIP_TIMES.outTo, backFrom: DAY_TRIP_TIMES.backFrom })}
                />
                {plan && planWin && (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="min-w-0">
                        <label className="label" htmlFor="dt-depart">
                          {t("dtDepart")}
                        </label>
                        <TimeInput
                          id="dt-depart"
                          clearable={false}
                          label={t("dtDepart")}
                          value={plan.depart}
                          onChange={(v) => v && setDates({ dayTripTimes: { ...plan, depart: v } })}
                        />
                      </div>
                      <div className="min-w-0">
                        <label className="label" htmlFor="dt-home">
                          {t("dtArriveHome")}
                        </label>
                        <TimeInput
                          id="dt-home"
                          clearable={false}
                          label={t("dtArriveHome")}
                          value={plan.arriveHome}
                          onChange={(v) => v && setDates({ dayTripTimes: { ...plan, arriveHome: v } })}
                        />
                        <p className="hint mt-1">{t("dtMidnightHint")}</p>
                      </div>
                    </div>
                    <div>
                      <p className="label">{t("dtMargin")}</p>
                      <Segmented
                        label={t("dtMargin")}
                        value={plan.flexHours}
                        onChange={(v) => setDates({ dayTripTimes: { ...plan, flexHours: v } })}
                        options={[1, 2, 3].map((h) => [h, `±${h} h`] as const)}
                      />
                    </div>
                    <p className="rounded-2xl bg-surface-2 px-3 py-2 text-sm tabular-nums">{t("dtSummary", planWin)}</p>
                  </div>
                )}
              </Block>
            )}

            <Segmented
              label={t("dateModeLabel")}
              value={dateMode}
              onChange={(v) => {
                setDateMode(v);
                if (v === "ranges" && !d.dates.ranges?.length) setDates({ ranges: [nextWeekend(today)] });
              }}
              options={[
                ["months", t("byMonths")],
                ["ranges", t("specificDays")],
              ]}
            />

            {dateMode === "ranges" ? (
              <Block title={t("specificDays")} hint={t("rangesHint")}>
                <RangeEditor value={d.dates.ranges ?? []} onChange={(ranges) => setDates({ ranges })} today={today} />
              </Block>
            ) : (
              <Block title={t("monthsTitle")} hint={t("monthsHint")}>
                <MonthPicker today={today} value={d.dates.months} onChange={(months) => setDates({ months })} />
              </Block>
            )}

            {!(d.dates.dayTrip && dateMode === "ranges") && (
            <Block title={dateMode === "ranges" ? t("nightsTitle") : t("daysOffTitle")}>
              {dateMode === "months" && (
              <div className="divide-y divide-border">
                <div className="pb-2">
                  <Switch checked={d.dates.weekendsOnly} onChange={(v) => setDates({ weekendsOnly: v })} label={d.dates.dayTrip ? t("weekendsHolidays") : t("weekendsBridges")} />
                </div>
                <div className="py-2">
                  <Switch
                    checked={d.dates.useHolidays}
                    onChange={(v) => setDates({ useHolidays: v })}
                    label={t("countHolidays")}
                    hint={t("countHolidaysHint")}
                  />
                </div>
                {!d.dates.dayTrip && (
                <div className="pt-2">
                  <Switch
                    checked={d.dates.departEveningBefore}
                    onChange={(v) => setDates({ departEveningBefore: v })}
                    label={t("eveningBefore")}
                    hint={t("eveningBeforeHint")}
                  />
                </div>
                )}
              </div>
              )}
              {!d.dates.dayTrip && (
              <div className="grid grid-cols-2 gap-3">
                <Stepper
                  label={t("minNights")}
                  min={1}
                  max={d.dates.maxNights}
                  value={d.dates.minNights}
                  onChange={(v) => setDates({ minNights: v })}
                />
                <Stepper
                  label={t("maxNights")}
                  min={d.dates.minNights}
                  max={30}
                  value={d.dates.maxNights}
                  onChange={(v) => setDates({ maxNights: v })}
                />
              </div>
              )}
              {dateMode === "months" && (
              <More label={t("vacationMore")}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="label">{t("extraDaysOff")}</p>
                    <DateList value={d.dates.extraDaysOff} onChange={(v) => setDates({ extraDaysOff: v })} />
                    <p className="hint mt-1">{t("extraDaysOffHint")}</p>
                  </div>
                  <div>
                    <p className="label">{t("excludeDates")}</p>
                    <DateList value={d.dates.excludeDates} onChange={(v) => setDates({ excludeDates: v })} />
                  </div>
                </div>
              </More>
              )}
            </Block>
            )}

            {/* En un viaje de un día con horas elegidas, ese plan sustituye a las franjas generales. */}
            {!plan && (
            <Block title={t("timesTitle")} hint={t("timesBlockHint")}>
              <Switch
                checked={timesOn}
                onChange={(v) => {
                  setTimesOn(v);
                  if (v && !d.dates.times) setDates({ times: {} });
                }}
                label={t("timesSwitch")}
              />
              {timesOn && <TimesEditor value={d.dates.times ?? {}} onChange={(times) => setDates({ times })} />}
            </Block>
            )}

            <section className={`rounded-3xl p-4 ${windows.length ? "bg-good-soft" : "bg-warn-soft"}`} aria-live="polite">
              <p className={`font-semibold ${windows.length ? "text-good" : "text-warn"}`}>
                {windows.length
                  ? t(d.dates.dayTrip ? "windowsDayTrip" : "windowsRound", { n: windows.length })
                  : t("noWindows")}
              </p>
              {windows.length > 0 ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-sm text-muted">{t("seeDates")}</summary>
                  <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-auto">
                    {windows.slice(0, 80).map((w) => (
                      <span key={`${w.depart}${w.ret}`} className="badge bg-surface" title={t("vacationDays", { n: w.workdaysUsed })}>
                        {w.depart === w.ret ? f.date(w.depart) : `${f.date(w.depart)} → ${f.date(w.ret)}`}
                        {w.workdaysUsed ? ` · ${t("vacDaysShort", { n: w.workdaysUsed })}` : ""}
                      </span>
                    ))}
                  </div>
                </details>
              ) : (
                <p className="text-sm text-muted">
                  {dateMode === "ranges" ? t("noWindowsRanges") : t("noWindowsMonths")}
                </p>
              )}
            </section>
          </>
        )}

        {step === 2 && (
          <>
            <Block title={t("flightTitle")}>
              <Money
                id="maxPrice"
                label={t("maxPrice")}
                value={d.flight.maxPrice}
                onChange={(v) => setFlight({ maxPrice: v ?? 0 })}
                min={10}
                max={2000}
              />
              <RouteHistoryHint d={d} dates={dates} />
              <div>
                <p className="label">{t("stopsLabel")}</p>
                <Segmented
                  label={t("stopsLabel")}
                  value={d.flight.maxStops}
                  onChange={(v) => setFlight({ maxStops: v })}
                  options={[
                    [0, t("stops0")],
                    [1, t("stopsUpTo", { n: 1 })],
                    [2, t("stopsUpTo", { n: 2 })],
                  ]}
                />
              </div>
              {d.destKind === "place" && (
                <div className="rounded-2xl bg-surface-2/60 p-3">
                  <Switch
                    checked={d.flight.selfTransfer !== false}
                    onChange={(v) => setFlight({ selfTransfer: v })}
                    label={t("selfTransfer")}
                    hint={t("selfTransferHint")}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Stepper
                  label={t("travellers")}
                  min={1}
                  max={9}
                  value={d.flight.passengers}
                  onChange={(v) => setFlight({ passengers: v })}
                  unit={(n) => t("personUnit", { n })}
                />
                <div>
                  <label className="label" htmlFor="maxDuration">
                    {t("maxDuration")}
                  </label>
                  <div className="relative">
                    <input
                      id="maxDuration"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      className="input pe-8"
                      placeholder={t("noLimit")}
                      value={d.flight.maxDurationHours ?? ""}
                      onChange={(e) => setFlight({ maxDurationHours: num(e.target.value) })}
                    />
                    <span className="pointer-events-none absolute top-1/2 end-3.5 -translate-y-1/2 text-sm text-muted">h</span>
                  </div>
                </div>
              </div>
            </Block>

            {d.dates.dayTrip ? (
              <Block title={t("stayTitle")}>
                <p className="hint">{t("dayTripNoStay")}</p>
              </Block>
            ) : (
            <Block title={t("stayTitle")}>
              <Switch
                checked={d.hotelOn}
                onChange={(v) => {
                  set("hotelOn", v);
                  if (!v && d.notifyMode === "flight_hotel") set("notifyMode", "flight");
                }}
                label={t("searchStay")}
                hint={t("searchStayHint")}
              />
              {d.hotelOn && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {HOTEL_TYPES.map((ht) => {
                      const on = d.hotel.types.includes(ht);
                      const Icon = HOTEL_ICON[ht];
                      return (
                        <button
                          key={ht}
                          type="button"
                          aria-pressed={on}
                          className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center text-xs font-medium transition ${on ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2"}`}
                          onClick={() =>
                            setHotel({
                              types: on ? d.hotel.types.filter((x) => x !== ht) : [...d.hotel.types, ht],
                            })
                          }
                        >
                          <Icon className="h-5 w-5" />
                          {hotelLabel(ht)}
                        </button>
                      );
                    })}
                  </div>
                  <Money
                    id="maxPerNight"
                    label={t("maxPerNight")}
                    value={d.hotel.maxPricePerNight}
                    onChange={(v) => setHotel({ maxPricePerNight: v })}
                    min={10}
                    max={400}
                    suffix={t("perNight")}
                  />
                  <div>
                    <p className="label">{t("minRating")}</p>
                    <Segmented
                      label={t("minRatingShort")}
                      value={d.hotel.minRating ?? 0}
                      onChange={(v) => setHotel({ minRating: v || undefined })}
                      options={[
                        [0, t("anyRating")],
                        ...[3.5, 4, 4.5].map((r) => [r, `${f.num(r, 1)}+`] as const),
                      ]}
                    />
                  </div>
                  <More>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="label" htmlFor="maxTotal">
                          {t("maxTotal")}
                        </label>
                        <div className="relative">
                          <input
                            id="maxTotal"
                            type="number"
                            inputMode="numeric"
                            className="input pe-12"
                            placeholder={t("noLimit")}
                            value={d.hotel.maxTotal === undefined ? "" : f.fromEur(d.hotel.maxTotal)}
                            onChange={(e) => {
                              const v = num(e.target.value);
                              setHotel({ maxTotal: v === undefined ? undefined : f.toEur(v) });
                            }}
                          />
                          <span className="pointer-events-none absolute top-1/2 end-3.5 -translate-y-1/2 text-sm text-muted">{f.symbol}</span>
                        </div>
                      </div>
                      <div>
                        <label className="label" htmlFor="minStars">
                          {t("minStars")}
                        </label>
                        <select
                          id="minStars"
                          className="input"
                          value={d.hotel.minStars ?? 0}
                          onChange={(e) =>
                            setHotel({
                              minStars: Number(e.target.value) || undefined,
                            })
                          }
                        >
                          {[0, 2, 3, 4, 5].map((s) => (
                            <option key={s} value={s}>
                              {s ? `${s}★` : t("anyStars")}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {d.destKind === "place" && (
                      <div>
                        <label className="label" htmlFor="tripadvisor">
                          {t("taCity")}
                        </label>
                        <input
                          id="tripadvisor"
                          className="input"
                          placeholder={t("taPlaceholder")}
                          value={taText}
                          onChange={(e) => {
                            setTaText(e.target.value);
                            setHotel({
                              tripadvisorGeo: parseTripadvisorGeo(e.target.value),
                            });
                          }}
                        />
                        <p className="hint mt-1">
                          {taText.trim() && !d.hotel.tripadvisorGeo
                            ? t("taNotFound")
                            : d.hotel.tripadvisorGeo
                              ? t("taUsing", { code: d.hotel.tripadvisorGeo })
                              : t("taAuto")}
                        </p>
                      </div>
                    )}
                  </More>
                </div>
              )}
            </Block>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <Block title={t("notifyTitle")}>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["flight", Plane, t("notifyFlight"), t("notifyFlightHint")],
                    ["flight_hotel", Bed, t("notifyBoth"), t("notifyBothHint")],
                  ] as const
                ).map(([v, Icon, title, h]) => {
                  const on = d.notifyMode === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() =>
                        setD((p) => ({
                          ...p,
                          notifyMode: v,
                          hotelOn: v === "flight_hotel" ? true : p.hotelOn,
                        }))
                      }
                      className={`flex gap-3 rounded-2xl border p-3 text-start transition ${on ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}
                    >
                      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${on ? "text-accent" : "text-muted"}`} />
                      <span>
                        <span className="block text-sm font-semibold">{title}</span>
                        <span className="hint">{h}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div>
                <p className="label">{t("checkEvery")}</p>
                <Segmented
                  label={t("checkEveryLabel")}
                  value={d.checkEveryHours}
                  onChange={(v) => set("checkEveryHours", v)}
                  options={[3, 6, 12, 24].map((h) => [h, `${h} h`] as const)}
                />
                <p className="hint mt-1.5">{t("checkEveryHint")}</p>
              </div>
            </Block>

            <Block title={t("summaryTitle")}>
              <div>
                <label className="label" htmlFor="name">
                  {t("alertName")}
                </label>
                <input
                  id="name"
                  className="input"
                  maxLength={80}
                  value={d.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder={suggestedName(d, t, f) || t("namePlaceholder")}
                />
              </div>
              <dl className="divide-y divide-border text-sm">
                {(
                  [
                    [
                      0,
                      t("step0"),
                      `${d.origins.join(", ")} → ${d.destKind === "place" ? (d.place?.label.split(",")[0] ?? "—") : t("anywhere")}${d.allowGround ? ` · ${t("plusGround")}` : ""}`,
                    ],
                    [
                      1,
                      t("step1"),
                      [
                        dateMode === "ranges" ? t("rangesCount", { n: dates.ranges?.length ?? 0 }) : f.list(dates.months.map(f.month)),
                        d.dates.dayTrip
                          ? plan
                            ? t("dtReview", { depart: plan.depart, home: plan.arriveHome, flex: plan.flexHours })
                            : t("sameDayRound")
                          : d.dates.minNights === d.dates.maxNights
                            ? f.nights(d.dates.minNights)
                            : t("nightsRange", { min: d.dates.minNights, max: d.dates.maxNights }),
                        dates.times ? t("withTimes") : "",
                        t("combinations", { n: windows.length }),
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    ],
                    [
                      2,
                      t("flightTitle"),
                      `${t("perPerson", { price: f.eur(d.flight.maxPrice) })} · ${f.stops(d.flight.maxStops)} · ${t("people", { n: d.flight.passengers })}`,
                    ],
                    [
                      2,
                      t("stayTitle"),
                      d.hotelOn && !d.dates.dayTrip
                        ? `${d.hotel.types.map(hotelLabel).join(", ")}${d.hotel.maxPricePerNight ? ` · ${t("perNightMax", { price: f.eur(d.hotel.maxPricePerNight) })}` : ""}`
                        : t("no"),
                    ],
                  ] as const
                ).map(([s, k, v]) => (
                  <div key={k} className="flex items-start gap-3 py-2.5">
                    <dt className="w-24 shrink-0 text-muted">{k}</dt>
                    <dd className="min-w-0 flex-1">{v}</dd>
                    <button type="button" className="shrink-0 text-sm font-medium text-accent" onClick={() => go(s)}>
                      {t("change")}
                    </button>
                  </div>
                ))}
              </dl>
            </Block>
          </>
        )}
      </div>

      {state?.error && (
        <p role="alert" className="rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
          {state.error}
        </p>
      )}

      {/* Barra de acciones: siempre a mano con el pulgar, por encima de la barra de navegación. */}
      <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 md:bottom-4">
        <div className="card flex items-center gap-2 p-2">
          {step > 0 && (
            <button type="button" className="btn-quiet" onClick={() => go(step - 1)} aria-label={t("back")}>
              <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />
            </button>
          )}
          <p className="hint min-w-0 flex-1 px-2 leading-snug">{!stepOk[step] && missing[step]}</p>
          {id && !isLast && (
            <button type="submit" className="btn-ghost" disabled={!ready || pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("save")}
            </button>
          )}
          {pending && <SearchingOverlay />}
          {/* Claves distintas: si React reutilizara el mismo <button>, el clic en «Siguiente»
              acabaría enviando el formulario al convertirse en «Crear» durante ese mismo clic. */}
          {isLast ? (
            <button key="submit" type="submit" className="btn-primary group" disabled={!ready || pending}>
              {pending ? t("searching") : id ? t("saveChanges") : t("createAndSearch")}
              <span className="btn-icon">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</span>
            </button>
          ) : (
            <button key="next" type="button" className="btn-primary group" disabled={!stepOk[step]} onClick={() => go(step + 1)}>
              {t("next")}
              <span className="btn-icon">
                <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
              </span>
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
