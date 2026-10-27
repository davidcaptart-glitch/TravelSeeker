"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveAlert, type FormState } from "@/app/actions";
import { formatDate, generateWindows } from "@/lib/dates";
import { monthLabel } from "@/lib/format";
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
    hotel: c?.hotel ?? { types: ["hotel", "apartment"], maxPricePerNight: 90, minRating: 4 },
    checkEveryHours: c?.checkEveryHours ?? 6,
  };
}

function toConfig(d: Draft): AlertConfig {
  return {
    name: d.name.trim(),
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
      ? { ...d.hotel, tripadvisorGeo: d.destKind === "place" ? d.hotel.tripadvisorGeo : undefined }
      : undefined,
    checkEveryHours: d.checkEveryHours,
  };
}

const HOTEL_LABEL = { hotel: "Hotel", apartment: "Apartamento", hostel: "Hostal / albergue" };

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold">
          <span className="mr-2 text-muted">{n}.</span>
          {title}
        </h2>
        {hint && <p className="hint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function num(v: string): number | undefined {
  const n = Number(v);
  return v === "" || Number.isNaN(n) ? undefined : n;
}

export function AlertForm({ id, initial, today }: { id?: string; initial?: AlertConfig; today: string }) {
  const [d, setD] = useState<Draft>(() => fromConfig(today, initial));
  const [state, action, pending] = useActionState<FormState, FormData>(saveAlert, undefined);
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
  const windows = useMemo(
    () => generateWindows(d.dates, new Set(d.dates.useHolidays ? holidays : []), today),
    [d.dates, holidays, today],
  );

  const ready = d.name.trim() && d.origins.length && (d.destKind === "anywhere" || d.place) && d.dates.months.length;

  return (
    <form action={action} className="space-y-5">
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="config" value={JSON.stringify(ready ? toConfig(d) : {})} />

      <Section n={1} title="Nombre y tipo de aviso">
        <div>
          <label className="label" htmlFor="name">
            Nombre
          </label>
          <input id="name" className="input" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Escapada a París" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["flight", "Avísame cuando el vuelo cumpla", "Si pides alojamiento, también te lo enseñamos, pero no hace falta que cumpla."],
              ["flight_hotel", "Solo cuando cumplan vuelo y alojamiento", "No te molestamos hasta que esté el paquete completo."],
            ] as const
          ).map(([v, t, h]) => (
            <label key={v} className={`cursor-pointer rounded-xl border p-3 ${d.notifyMode === v ? "border-accent bg-accent-soft" : "border-border"}`}>
              <input
                type="radio"
                className="sr-only"
                checked={d.notifyMode === v}
                onChange={() => {
                  set("notifyMode", v);
                  if (v === "flight_hotel") set("hotelOn", true);
                }}
              />
              <p className="text-sm font-medium">{t}</p>
              <p className="hint">{h}</p>
            </label>
          ))}
        </div>
      </Section>

      <Section n={2} title="Desde dónde sales" hint="Puedes elegir varios aeropuertos de salida.">
        <AirportMultiPicker value={d.origins} onChange={(v) => set("origins", v)} />
      </Section>

      <Section n={3} title="Adónde quieres ir">
        <div className="flex gap-2">
          <button type="button" className={`chip ${d.destKind === "place" ? "chip-on" : ""}`} onClick={() => set("destKind", "place")}>
            Un sitio concreto
          </button>
          <button type="button" className={`chip ${d.destKind === "anywhere" ? "chip-on" : ""}`} onClick={() => set("destKind", "anywhere")}>
            Me da igual / sorpréndeme
          </button>
        </div>

        {d.destKind === "place" ? (
          <>
            <PlacePicker
              value={d.place}
              onChange={(p) => setD((x) => ({ ...x, place: p, destinationAirports: [] }))}
              placeholder="París, Cracovia, Cap d'Agde…"
            />
            {d.place && (
              <div className="space-y-3">
                <div>
                  <label className="label">Aeropuertos de llegada (radio {d.airportRadiusKm} km)</label>
                  <input
                    type="range"
                    min={20}
                    max={400}
                    step={10}
                    value={d.airportRadiusKm}
                    onChange={(e) => set("airportRadiusKm", Number(e.target.value))}
                    className="w-full accent-[var(--accent)]"
                  />
                  <NearbyAirports
                    place={d.place}
                    radiusKm={d.airportRadiusKm}
                    value={d.destinationAirports}
                    onChange={(v) => set("destinationAirports", v)}
                  />
                  <p className="hint mt-1">
                    {d.destinationAirports.length
                      ? `Solo se buscarán vuelos a ${d.destinationAirports.join(", ")}.`
                      : "Sin seleccionar = los más cercanos automáticamente."}
                  </p>
                </div>
                <Toggle
                  checked={d.allowGround}
                  onChange={(v) => set("allowGround", v)}
                  label="Calcular rutas alternativas (aeropuertos más lejanos + tren/bus, o ir solo por tierra)"
                />
                {d.allowGround && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">Máximo por tierra desde el aeropuerto</label>
                      <select
                        className="input"
                        value={d.maxGroundMinutes}
                        onChange={(e) => set("maxGroundMinutes", Number(e.target.value))}
                      >
                        {[60, 120, 180, 240, 360, 480].map((m) => (
                          <option key={m} value={m}>
                            {m / 60} h
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Ir sin avión desde (opcional)</label>
                      <PlacePicker value={d.groundFrom} onChange={(p) => set("groundFrom", p)} placeholder="Barcelona Sants, tu casa…" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="label">Tipo de destino</label>
              <div className="flex flex-wrap gap-1.5">
                {DESTINATION_THEMES.map((t) => {
                  const on = d.themes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      className={`chip capitalize ${on ? "chip-on" : ""}`}
                      onClick={() => set("themes", on ? d.themes.filter((x) => x !== t) : [...d.themes, t])}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <p className="hint mt-1">Sin marcar ninguno = cualquier destino.</p>
            </div>
            <div>
              <label className="label">Solo estos países (opcional)</label>
              <input className="input" value={d.countries} onChange={(e) => set("countries", e.target.value)} placeholder="FR, IT, PT" />
            </div>
          </div>
        )}
      </Section>

      <Section n={4} title="Cuándo puedes viajar" hint="Cada alerta tiene sus propios meses y días.">
        <div>
          <label className="label">Meses</label>
          <div className="flex flex-wrap gap-1.5">
            {nextMonths(today, 12).map((m) => {
              const on = d.dates.months.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  className={`chip capitalize ${on ? "chip-on" : ""}`}
                  onClick={() => setDates({ months: on ? d.dates.months.filter((x) => x !== m) : [...d.dates.months, m].sort() })}
                >
                  {monthLabel(m)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle checked={d.dates.weekendsOnly} onChange={(v) => setDates({ weekendsOnly: v })} label="Solo fines de semana y puentes" />
          <Toggle checked={d.dates.useHolidays} onChange={(v) => setDates({ useHolidays: v })} label="Contar festivos oficiales (ver Ajustes)" />
          <Toggle
            checked={d.dates.departEveningBefore}
            onChange={(v) => setDates({ departEveningBefore: v })}
            label="Puedo salir la tarde anterior (p. ej. viernes)"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Noches mínimas</label>
            <input
              type="number"
              min={1}
              max={30}
              className="input"
              value={d.dates.minNights}
              onChange={(e) => setDates({ minNights: Number(e.target.value) || 1 })}
            />
          </div>
          <div>
            <label className="label">Noches máximas</label>
            <input
              type="number"
              min={1}
              max={30}
              className="input"
              value={d.dates.maxNights}
              onChange={(e) => setDates({ maxNights: Number(e.target.value) || 1 })}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Días que te puedes coger</label>
            <DateList value={d.dates.extraDaysOff} onChange={(v) => setDates({ extraDaysOff: v })} />
            <p className="hint mt-1">Se suman a los findes para formar puentes.</p>
          </div>
          <div>
            <label className="label">Días que NO puedes</label>
            <DateList value={d.dates.excludeDates} onChange={(v) => setDates({ excludeDates: v })} />
          </div>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="mb-2 text-sm font-medium">{windows.length} combinaciones de ida y vuelta</p>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">
            {windows.slice(0, 60).map((w) => (
              <span key={`${w.depart}${w.ret}`} className="badge bg-surface" title={`${w.workdaysUsed} días de vacaciones`}>
                {formatDate(w.depart)} → {formatDate(w.ret)}
                {w.workdaysUsed ? ` · ${w.workdaysUsed}d` : ""}
              </span>
            ))}
          </div>
        </div>
      </Section>

      <Section n={5} title="Vuelo">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="label">Precio máx. ida y vuelta (por persona)</label>
            <input
              type="number"
              min={1}
              className="input"
              value={d.flight.maxPrice}
              onChange={(e) => setFlight({ maxPrice: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="label">Escalas</label>
            <select className="input" value={d.flight.maxStops} onChange={(e) => setFlight({ maxStops: Number(e.target.value) })}>
              <option value={0}>Solo directos</option>
              <option value={1}>Máx. 1 escala</option>
              <option value={2}>Máx. 2 escalas</option>
            </select>
          </div>
          <div>
            <label className="label">Viajeros</label>
            <input
              type="number"
              min={1}
              max={9}
              className="input"
              value={d.flight.passengers}
              onChange={(e) => setFlight({ passengers: Number(e.target.value) || 1 })}
            />
          </div>
          <div>
            <label className="label">Duración máx. (h, opcional)</label>
            <input
              type="number"
              min={1}
              className="input"
              value={d.flight.maxDurationHours ?? ""}
              onChange={(e) => setFlight({ maxDurationHours: num(e.target.value) })}
            />
          </div>
        </div>
      </Section>

      <Section n={6} title="Alojamiento">
        <Toggle
          checked={d.hotelOn}
          onChange={(v) => {
            set("hotelOn", v);
            if (!v && d.notifyMode === "flight_hotel") set("notifyMode", "flight");
          }}
          label="Buscar también alojamiento"
        />
        {d.hotelOn && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {HOTEL_TYPES.map((t) => {
                const on = d.hotel.types.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    className={`chip ${on ? "chip-on" : ""}`}
                    onClick={() => setHotel({ types: on ? d.hotel.types.filter((x) => x !== t) : [...d.hotel.types, t] })}
                  >
                    {HOTEL_LABEL[t]}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="label">Máx. por noche (€)</label>
                <input
                  type="number"
                  className="input"
                  value={d.hotel.maxPricePerNight ?? ""}
                  onChange={(e) => setHotel({ maxPricePerNight: num(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Máx. total estancia (€)</label>
                <input type="number" className="input" value={d.hotel.maxTotal ?? ""} onChange={(e) => setHotel({ maxTotal: num(e.target.value) })} />
              </div>
              <div>
                <label className="label">Nota mínima (0-5)</label>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={5}
                  className="input"
                  value={d.hotel.minRating ?? ""}
                  onChange={(e) => setHotel({ minRating: num(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Estrellas mínimas</label>
                <select className="input" value={d.hotel.minStars ?? 0} onChange={(e) => setHotel({ minStars: Number(e.target.value) || undefined })}>
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
                <label className="label">Ciudad en TripAdvisor (opcional)</label>
                <input
                  className="input"
                  placeholder="https://www.tripadvisor.es/Tourism-g274772-Krakow…  o  g274772"
                  value={taText}
                  onChange={(e) => {
                    setTaText(e.target.value);
                    setHotel({ tripadvisorGeo: parseTripadvisorGeo(e.target.value) });
                  }}
                />
                <p className="hint mt-1">
                  {taText.trim() && !d.hotel.tripadvisorGeo
                    ? "No encuentro el código en ese texto: debe contener algo como g274772."
                    : d.hotel.tripadvisorGeo
                      ? `Se usará el código ${d.hotel.tripadvisorGeo} para los precios de alojamiento.`
                      : "Normalmente se detecta solo. Si no aparecen alojamientos, pega aquí el enlace de la ciudad en TripAdvisor."}
                </p>
              </div>
            )}
          </>
        )}
      </Section>

      <Section n={7} title="Frecuencia de búsqueda" hint="Con fuentes gratuitas, menos frecuencia = más cupo para el resto de alertas.">
        <select className="input max-w-xs" value={d.checkEveryHours} onChange={(e) => set("checkEveryHours", Number(e.target.value))}>
          {[2, 3, 6, 12, 24].map((h) => (
            <option key={h} value={h}>
              Cada {h} horas
            </option>
          ))}
        </select>
      </Section>

      {state?.error && <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{state.error}</p>}
      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        {!ready && <p className="hint mr-auto">Falta nombre, origen, destino o meses.</p>}
        <button type="submit" className="btn-primary" disabled={!ready || pending}>
          {pending ? "Guardando y buscando…" : id ? "Guardar cambios" : "Crear alerta y buscar"}
        </button>
      </div>
    </form>
  );
}
