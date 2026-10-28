"use client";

import { ArrowLeft, ArrowRight, Bed, Building2, Check, ChevronDown, Compass, Home, Hotel, Loader2, MapPin, Minus, Plane, Plus } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { saveAlert, type FormState } from "@/app/actions";
import { formatDate, generateWindows } from "@/lib/dates";
import { eur, monthLabel, STOPS_LABEL } from "@/lib/format";
import { DESTINATION_THEMES, HOTEL_TYPES, parseTripadvisorGeo, type AlertConfig, type Place } from "@/lib/types";
import { AirportMultiPicker, DateList, NearbyAirports, PlacePicker } from "./pickers";

type Draft = Omit<AlertConfig, "destination" | "hotel"> & {
  destKind: "place" | "anywhere";
  place?: Place;
  themes: (typeof DESTINATION_THEMES)[number][];
  countries: string;
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
    countries: c?.destination.kind === "anywhere" ? c.destination.countries.join(", ") : "",
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

function suggestedName(d: Draft): string {
  if (d.destKind === "place") return d.place ? `Escapada a ${d.place.label.split(",")[0]}` : "";
  return d.themes.length ? `Sorpresa de ${d.themes.join(" y ")}` : "Sorpréndeme";
}

function toConfig(d: Draft): AlertConfig {
  return {
    name: (d.name.trim() || suggestedName(d)).slice(0, 80),
    notifyMode: d.notifyMode,
    origins: d.origins,
    destination:
      d.destKind === "place"
        ? { kind: "place", place: d.place! }
        : {
            kind: "anywhere",
            themes: d.themes,
            countries: d.countries
              .split(/[,\s]+/)
              .map((s) => s.trim().toUpperCase())
              .filter((s) => /^[A-Z]{2}$/.test(s)),
          },
    destinationAirports: d.destKind === "place" ? d.destinationAirports : [],
    airportRadiusKm: d.airportRadiusKm,
    allowGround: d.allowGround,
    maxGroundMinutes: d.maxGroundMinutes,
    groundFrom: d.allowGround ? d.groundFrom : undefined,
    dates: d.dates,
    flight: d.flight,
    hotel: d.hotelOn
      ? {
          ...d.hotel,
          tripadvisorGeo: d.destKind === "place" ? d.hotel.tripadvisorGeo : undefined,
        }
      : undefined,
    checkEveryHours: d.checkEveryHours,
  };
}

const HOTEL_LABEL = {
  hotel: "Hotel",
  apartment: "Apartamento",
  hostel: "Hostal / albergue",
};
const HOTEL_ICON = { hotel: Hotel, apartment: Home, hostel: Building2 };

const STEPS = [
  { title: "Ruta", lead: "¿Desde dónde sales y adónde quieres ir?" },
  { title: "Fechas", lead: "¿Cuándo puedes viajar?" },
  { title: "Presupuesto", lead: "¿Cuánto quieres pagar como máximo?" },
  { title: "Aviso", lead: "¿Cuándo te avisamos?" },
] as const;

/* ---------- Controles ---------- */

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
        className="relative h-7 w-12 shrink-0 rounded-full bg-border transition peer-checked:bg-accent peer-focus-visible:ring-4 peer-focus-visible:ring-accent/25 after:absolute after:top-1 after:left-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
      />
    </label>
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
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-border p-1">
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-xl hover:bg-surface-2 disabled:opacity-30"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={`Menos: ${label}`}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="text-base font-semibold tabular-nums" aria-live="polite">
          {value}
          {unit ? <span className="ml-1 text-sm font-normal text-muted">{unit(value)}</span> : null}
        </span>
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-xl hover:bg-surface-2 disabled:opacity-30"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={`Más: ${label}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Money({
  id,
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 5,
  suffix,
}: {
  id: string;
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
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
          min={min}
          className="input pr-16 text-lg font-semibold tabular-nums"
          value={value ?? ""}
          placeholder="Sin límite"
          onChange={(e) => onChange(num(e.target.value))}
        />
        <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-muted">€{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(value ?? max, max)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-[var(--accent)]"
        aria-label={label}
      />
    </div>
  );
}

function More({ children, label = "Más opciones" }: { children: React.ReactNode; label?: string }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-accent">
        {label}
        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

/** La primera búsqueda consulta muchas fechas y puede tardar cerca de un minuto: que se vea que está trabajando. */
export function SearchingOverlay() {
  // Si la búsqueda sale de la caché tarda milisegundos: solo se muestra si de verdad hay que esperar.
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
        <p className="mt-4 font-semibold">Buscando tu viaje…</p>
        <p className="mt-1 text-sm text-muted">Revisamos vuelos, alojamiento y trayectos en todas tus fechas. Puede tardar hasta un minuto.</p>
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
  const [d, setD] = useState<Draft>(() => fromConfig(today, initial));
  const [state, action, pending] = useActionState<FormState, FormData>(saveAlert, undefined);
  const [step, setStep] = useState(0);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const setDates = (patch: Partial<Draft["dates"]>) => setD((p) => ({ ...p, dates: { ...p.dates, ...patch } }));
  const setFlight = (patch: Partial<Draft["flight"]>) => setD((p) => ({ ...p, flight: { ...p.flight, ...patch } }));
  const setHotel = (patch: Partial<Draft["hotel"]>) => setD((p) => ({ ...p, hotel: { ...p.hotel, ...patch } }));
  // Texto tal cual lo pega el usuario (enlace o código); en la alerta se guarda solo el código.
  const [taText, setTaText] = useState(d.hotel.tripadvisorGeo ?? "");

  // Festivos del usuario para previsualizar las fechas exactas que se buscarán.
  const years = [...new Set(d.dates.months.map((m) => m.slice(0, 4)))].join(",");
  const [holidays, setHolidays] = useState<string[]>([]);
  useEffect(() => {
    if (!years) return;
    fetch(`/api/holidays?years=${years}`)
      .then((r) => r.json())
      .then((j: { dates: string[] }) => setHolidays(j.dates))
      .catch(() => {});
  }, [years]);
  const windows = useMemo(() => generateWindows(d.dates, new Set(d.dates.useHolidays ? holidays : []), today), [d.dates, holidays, today]);

  const stepOk = [
    d.origins.length > 0 && (d.destKind === "anywhere" || Boolean(d.place)),
    d.dates.months.length > 0 && windows.length > 0,
    d.flight.maxPrice > 0 && (!d.hotelOn || d.hotel.types.length > 0),
    true,
  ];
  const missing = [
    !d.origins.length ? "Elige al menos un aeropuerto de salida." : "Elige un destino o «Sorpréndeme».",
    !d.dates.months.length ? "Elige al menos un mes." : "Con estas condiciones no hay ninguna fecha posible.",
    "Indica un precio y algún tipo de alojamiento.",
    "",
  ];
  const ready = stepOk.every(Boolean);
  const isLast = step === STEPS.length - 1;
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
      <input type="hidden" name="config" value={JSON.stringify(ready ? toConfig(d) : {})} />

      {/* Progreso */}
      <nav aria-label="Pasos" className="space-y-3">
        <ol className="grid grid-cols-4 gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <button
                type="button"
                disabled={!canReach(i)}
                onClick={() => go(i)}
                aria-current={step === i ? "step" : undefined}
                className="group w-full text-left disabled:cursor-not-allowed"
              >
                <span className={`block h-1.5 rounded-full transition ${i <= step ? "bg-accent" : "bg-border"}`} />
                <span className={`mt-1.5 block truncate text-xs font-medium ${step === i ? "text-foreground" : "text-muted"}`}>
                  {i + 1}. {s.title}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <h2 className="text-xl font-semibold tracking-tight">{STEPS[step].lead}</h2>
      </nav>

      <div key={step} className="animate-rise space-y-4">
        {step === 0 && (
          <>
            <Block title="Sales desde" hint="Puedes añadir varios aeropuertos.">
              <AirportMultiPicker value={d.origins} onChange={(v) => set("origins", v)} />
            </Block>

            <Block title="Destino">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["place", MapPin, "Un sitio concreto", "Ciudad, pueblo o zona"],
                    ["anywhere", Compass, "Sorpréndeme", "Donde sea más barato"],
                  ] as const
                ).map(([v, Icon, t, h]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={d.destKind === v}
                    onClick={() => set("destKind", v)}
                    className={`rounded-2xl border p-3 text-left transition ${d.destKind === v ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}
                  >
                    <Icon className={`mb-2 h-5 w-5 ${d.destKind === v ? "text-accent" : "text-muted"}`} />
                    <span className="block text-sm font-semibold">{t}</span>
                    <span className="hint">{h}</span>
                  </button>
                ))}
              </div>

              {d.destKind === "place" ? (
                <div className="space-y-4">
                  <PlacePicker
                    value={d.place}
                    onChange={(p) => setD((x) => ({ ...x, place: p, destinationAirports: [] }))}
                    placeholder="París, Cracovia, Cap d'Agde…"
                  />
                  {d.place && (
                    <>
                      <div>
                        <div className="flex items-baseline justify-between">
                          <p className="label">Aeropuertos de llegada</p>
                          <span className="text-sm text-muted tabular-nums">hasta {d.airportRadiusKm} km</span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={400}
                          step={10}
                          value={d.airportRadiusKm}
                          onChange={(e) => set("airportRadiusKm", Number(e.target.value))}
                          className="mb-3 w-full accent-[var(--accent)]"
                          aria-label="Distancia máxima del aeropuerto"
                        />
                        <NearbyAirports
                          place={d.place}
                          radiusKm={d.airportRadiusKm}
                          value={d.destinationAirports}
                          onChange={(v) => set("destinationAirports", v)}
                        />
                        <p className="hint mt-2">
                          {d.destinationAirports.length
                            ? `Solo se buscarán vuelos a ${d.destinationAirports.join(", ")}.`
                            : "Si no marcas ninguno, se usan los más cercanos."}
                        </p>
                      </div>
                      <div className="border-t border-border pt-3">
                        <Switch
                          checked={d.allowGround}
                          onChange={(v) => set("allowGround", v)}
                          label="Rutas alternativas en tren o bus"
                          hint="Aeropuertos más lejanos + tren/bus, o ir solo por tierra."
                        />
                        {d.allowGround && (
                          <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            <div>
                              <p className="label">Máximo por tierra desde el aeropuerto</p>
                              <Segmented
                                label="Máximo por tierra"
                                value={d.maxGroundMinutes}
                                onChange={(v) => set("maxGroundMinutes", v)}
                                options={[60, 120, 240, 360].map((m) => [m, `${m / 60} h`] as const)}
                              />
                            </div>
                            <div>
                              <p className="label">Ir sin avión desde (opcional)</p>
                              <PlacePicker value={d.groundFrom} onChange={(p) => set("groundFrom", p)} placeholder="Barcelona Sants, tu casa…" />
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
                    <p className="label">¿Qué te apetece?</p>
                    <div className="flex flex-wrap gap-2">
                      {DESTINATION_THEMES.map((t) => {
                        const on = d.themes.includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            aria-pressed={on}
                            className={`chip capitalize ${on ? "chip-on" : ""}`}
                            onClick={() => set("themes", on ? d.themes.filter((x) => x !== t) : [...d.themes, t])}
                          >
                            {on && <Check className="h-3.5 w-3.5" />}
                            {t}
                          </button>
                        );
                      })}
                    </div>
                    <p className="hint mt-2">Sin marcar ninguno = cualquier destino.</p>
                  </div>
                  <div>
                    <label className="label" htmlFor="countries">
                      Solo estos países (opcional)
                    </label>
                    <input
                      id="countries"
                      className="input"
                      value={d.countries}
                      onChange={(e) => set("countries", e.target.value)}
                      placeholder="FR, IT, PT"
                    />
                  </div>
                </div>
              )}
            </Block>
          </>
        )}

        {step === 1 && (
          <>
            <Block title="Meses" hint="Toca los meses en los que podrías ir.">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {nextMonths(today, 12).map((m) => {
                  const on = d.dates.months.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={on}
                      className={`chip justify-center capitalize ${on ? "chip-on" : ""}`}
                      onClick={() =>
                        setDates({
                          months: on ? d.dates.months.filter((x) => x !== m) : [...d.dates.months, m].sort(),
                        })
                      }
                    >
                      {monthLabel(m)}
                    </button>
                  );
                })}
              </div>
            </Block>

            <Block title="Tus días libres">
              <div className="divide-y divide-border">
                <div className="pb-2">
                  <Switch checked={d.dates.weekendsOnly} onChange={(v) => setDates({ weekendsOnly: v })} label="Solo fines de semana y puentes" />
                </div>
                <div className="py-2">
                  <Switch
                    checked={d.dates.useHolidays}
                    onChange={(v) => setDates({ useHolidays: v })}
                    label="Contar festivos"
                    hint="Los de tu país y región (en Ajustes)."
                  />
                </div>
                <div className="pt-2">
                  <Switch
                    checked={d.dates.departEveningBefore}
                    onChange={(v) => setDates({ departEveningBefore: v })}
                    label="Puedo salir la tarde anterior"
                    hint="Por ejemplo, el viernes por la tarde."
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Stepper
                  label="Noches mínimas"
                  min={1}
                  max={d.dates.maxNights}
                  value={d.dates.minNights}
                  onChange={(v) => setDates({ minNights: v })}
                />
                <Stepper
                  label="Noches máximas"
                  min={d.dates.minNights}
                  max={30}
                  value={d.dates.maxNights}
                  onChange={(v) => setDates({ maxNights: v })}
                />
              </div>
              <More label="Días de vacaciones y días que no puedes">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="label">Días que te puedes coger</p>
                    <DateList value={d.dates.extraDaysOff} onChange={(v) => setDates({ extraDaysOff: v })} />
                    <p className="hint mt-1">Se suman a los findes para formar puentes.</p>
                  </div>
                  <div>
                    <p className="label">Días que NO puedes</p>
                    <DateList value={d.dates.excludeDates} onChange={(v) => setDates({ excludeDates: v })} />
                  </div>
                </div>
              </More>
            </Block>

            <section className={`rounded-3xl p-4 ${windows.length ? "bg-good-soft" : "bg-warn-soft"}`} aria-live="polite">
              <p className={`font-semibold ${windows.length ? "text-good" : "text-warn"}`}>
                {windows.length
                  ? `${windows.length} ${windows.length === 1 ? "viaje posible" : "viajes posibles"} de ida y vuelta`
                  : "Ninguna fecha encaja todavía"}
              </p>
              {windows.length > 0 ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-sm text-muted">Ver las fechas</summary>
                  <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-auto">
                    {windows.slice(0, 80).map((w) => (
                      <span key={`${w.depart}${w.ret}`} className="badge bg-surface" title={`${w.workdaysUsed} días de vacaciones`}>
                        {formatDate(w.depart)} → {formatDate(w.ret)}
                        {w.workdaysUsed ? ` · ${w.workdaysUsed}d` : ""}
                      </span>
                    ))}
                  </div>
                </details>
              ) : (
                <p className="text-sm text-muted">Añade meses, permite días sueltos o cambia las noches.</p>
              )}
            </section>
          </>
        )}

        {step === 2 && (
          <>
            <Block title="Vuelo">
              <Money
                id="maxPrice"
                label="Precio máximo ida y vuelta, por persona"
                value={d.flight.maxPrice}
                onChange={(v) => setFlight({ maxPrice: v ?? 0 })}
                min={10}
                max={800}
              />
              <div>
                <p className="label">Escalas</p>
                <Segmented
                  label="Escalas"
                  value={d.flight.maxStops}
                  onChange={(v) => setFlight({ maxStops: v })}
                  options={[
                    [0, "Directo"],
                    [1, "Hasta 1"],
                    [2, "Hasta 2"],
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Stepper
                  label="Viajeros"
                  min={1}
                  max={9}
                  value={d.flight.passengers}
                  onChange={(v) => setFlight({ passengers: v })}
                  unit={(n) => (n === 1 ? "persona" : "personas")}
                />
                <div>
                  <label className="label" htmlFor="maxDuration">
                    Duración máx.
                  </label>
                  <div className="relative">
                    <input
                      id="maxDuration"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      className="input pr-8"
                      placeholder="Sin límite"
                      value={d.flight.maxDurationHours ?? ""}
                      onChange={(e) => setFlight({ maxDurationHours: num(e.target.value) })}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-muted">h</span>
                  </div>
                </div>
              </div>
            </Block>

            <Block title="Alojamiento">
              <Switch
                checked={d.hotelOn}
                onChange={(v) => {
                  set("hotelOn", v);
                  if (!v && d.notifyMode === "flight_hotel") set("notifyMode", "flight");
                }}
                label="Buscar también alojamiento"
                hint="Precios de Booking, Agoda, Trip.com… vía TripAdvisor."
              />
              {d.hotelOn && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {HOTEL_TYPES.map((t) => {
                      const on = d.hotel.types.includes(t);
                      const Icon = HOTEL_ICON[t];
                      return (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={on}
                          className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center text-xs font-medium transition ${on ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2"}`}
                          onClick={() =>
                            setHotel({
                              types: on ? d.hotel.types.filter((x) => x !== t) : [...d.hotel.types, t],
                            })
                          }
                        >
                          <Icon className="h-5 w-5" />
                          {HOTEL_LABEL[t]}
                        </button>
                      );
                    })}
                  </div>
                  <Money
                    id="maxPerNight"
                    label="Máximo por noche"
                    value={d.hotel.maxPricePerNight}
                    onChange={(v) => setHotel({ maxPricePerNight: v })}
                    min={10}
                    max={400}
                    suffix="/noche"
                  />
                  <div>
                    <p className="label">Nota mínima de los clientes</p>
                    <Segmented
                      label="Nota mínima"
                      value={d.hotel.minRating ?? 0}
                      onChange={(v) => setHotel({ minRating: v || undefined })}
                      options={[
                        [0, "Da igual"],
                        [3.5, "3,5+"],
                        [4, "4+"],
                        [4.5, "4,5+"],
                      ]}
                    />
                  </div>
                  <More>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="label" htmlFor="maxTotal">
                          Máximo por toda la estancia
                        </label>
                        <div className="relative">
                          <input
                            id="maxTotal"
                            type="number"
                            inputMode="numeric"
                            className="input pr-8"
                            placeholder="Sin límite"
                            value={d.hotel.maxTotal ?? ""}
                            onChange={(e) => setHotel({ maxTotal: num(e.target.value) })}
                          />
                          <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-muted">€</span>
                        </div>
                      </div>
                      <div>
                        <label className="label" htmlFor="minStars">
                          Estrellas mínimas
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
                              {s ? `${s}★` : "Indiferente"}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {d.destKind === "place" && (
                      <div>
                        <label className="label" htmlFor="tripadvisor">
                          Ciudad en TripAdvisor
                        </label>
                        <input
                          id="tripadvisor"
                          className="input"
                          placeholder="Enlace de la ciudad o código g274772"
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
                            ? "No encuentro el código en ese texto: debe contener algo como g274772."
                            : d.hotel.tripadvisorGeo
                              ? `Se usará el código ${d.hotel.tripadvisorGeo} para los precios de alojamiento.`
                              : "Normalmente se detecta solo. Úsalo solo si la alerta te dice que no encuentra alojamientos."}
                        </p>
                      </div>
                    )}
                  </More>
                </div>
              )}
            </Block>
          </>
        )}

        {step === 3 && (
          <>
            <Block title="Avísame…">
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["flight", Plane, "Cuando el vuelo cumpla", "Si pides alojamiento, también te lo enseñamos, pero no hace falta que cumpla."],
                    ["flight_hotel", Bed, "Solo con vuelo y alojamiento", "No te molestamos hasta que esté el paquete completo."],
                  ] as const
                ).map(([v, Icon, t, h]) => {
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
                      className={`flex gap-3 rounded-2xl border p-3 text-left transition ${on ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}
                    >
                      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${on ? "text-accent" : "text-muted"}`} />
                      <span>
                        <span className="block text-sm font-semibold">{t}</span>
                        <span className="hint">{h}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div>
                <p className="label">Buscar cada</p>
                <Segmented
                  label="Frecuencia de búsqueda"
                  value={d.checkEveryHours}
                  onChange={(v) => set("checkEveryHours", v)}
                  options={[3, 6, 12, 24].map((h) => [h, `${h} h`] as const)}
                />
                <p className="hint mt-1.5">Menos frecuencia deja más búsquedas gratuitas para tus otras alertas.</p>
              </div>
            </Block>

            <Block title="Resumen">
              <div>
                <label className="label" htmlFor="name">
                  Nombre de la alerta
                </label>
                <input
                  id="name"
                  className="input"
                  maxLength={80}
                  value={d.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder={suggestedName(d) || "Escapada a París"}
                />
              </div>
              <dl className="divide-y divide-border text-sm">
                {(
                  [
                    [
                      0,
                      "Ruta",
                      `${d.origins.join(", ")} → ${d.destKind === "place" ? (d.place?.label.split(",")[0] ?? "—") : "cualquier sitio"}${d.allowGround ? " · + tren/bus" : ""}`,
                    ],
                    [
                      1,
                      "Fechas",
                      `${d.dates.months.map(monthLabel).join(", ")} · ${d.dates.minNights}-${d.dates.maxNights} noches · ${windows.length} combinaciones`,
                    ],
                    [
                      2,
                      "Vuelo",
                      `≤ ${eur(d.flight.maxPrice)}/persona · ${STOPS_LABEL[d.flight.maxStops]} · ${d.flight.passengers} ${d.flight.passengers === 1 ? "persona" : "personas"}`,
                    ],
                    [
                      2,
                      "Alojamiento",
                      d.hotelOn
                        ? `${d.hotel.types.map((t) => HOTEL_LABEL[t]).join(", ")}${d.hotel.maxPricePerNight ? ` · ≤ ${eur(d.hotel.maxPricePerNight)}/noche` : ""}`
                        : "No",
                    ],
                  ] as const
                ).map(([s, k, v]) => (
                  <div key={k} className="flex items-start gap-3 py-2.5">
                    <dt className="w-24 shrink-0 text-muted">{k}</dt>
                    <dd className="min-w-0 flex-1">{v}</dd>
                    <button type="button" className="shrink-0 text-sm font-medium text-accent" onClick={() => go(s)}>
                      Cambiar
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
      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 md:bottom-4">
        <div className="card flex items-center gap-2 p-2">
          {step > 0 && (
            <button type="button" className="btn-quiet" onClick={() => go(step - 1)} aria-label="Atrás">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <p className="hint min-w-0 flex-1 px-2 leading-snug">{!stepOk[step] && missing[step]}</p>
          {id && !isLast && (
            <button type="submit" className="btn-ghost" disabled={!ready || pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </button>
          )}
          {pending && <SearchingOverlay />}
          {/* Claves distintas: si React reutilizara el mismo <button>, el clic en «Siguiente»
              acabaría enviando el formulario al convertirse en «Crear» durante ese mismo clic. */}
          {isLast ? (
            <button key="submit" type="submit" className="btn-primary" disabled={!ready || pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
                </>
              ) : id ? (
                "Guardar cambios"
              ) : (
                <>
                  <Check className="h-4 w-4" /> Crear y buscar
                </>
              )}
            </button>
          ) : (
            <button key="next" type="button" className="btn-primary" disabled={!stepOk[step]} onClick={() => go(step + 1)}>
              Siguiente <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
