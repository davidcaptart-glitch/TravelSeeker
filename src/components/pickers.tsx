"use client";

import { MapPin, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/types";

type AirportHit = {
  iata: string;
  name: string;
  city: string;
  country: string;
  km?: number;
};

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function useSearch<T>(url: (q: string) => string, q: string, minLength = 2) {
  const dq = useDebounced(q);
  const [hits, setHits] = useState<T[]>([]);
  const urlRef = useRef(url);
  useEffect(() => {
    if (dq.trim().length < minLength) return;
    let cancelled = false;
    fetch(urlRef.current(dq))
      .then((r) => r.json())
      .then((j: T[]) => !cancelled && setHits(j))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dq, minLength]);
  return dq.trim().length < minLength ? [] : hits;
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <>
      <Search className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-muted" />
      <input
        className="input scroll-mt-20 pl-10"
        type="search"
        autoComplete="off"
        // En el móvil, el teclado y la barra inferior tapan las sugerencias: sube el buscador arriba del todo.
        onFocus={(e) => {
          const el = e.currentTarget;
          if (window.matchMedia("(max-width: 767px)").matches) setTimeout(() => el.scrollIntoView({ block: "start", behavior: "smooth" }), 250);
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </>
  );
}

const LIST = "absolute z-20 mt-1.5 max-h-72 w-full overflow-auto rounded-2xl border border-border bg-surface p-1 shadow-xl";
const ITEM = "w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-surface-2";

export function AirportMultiPicker({
  value,
  onChange,
  placeholder = "Ciudad o código (BCN, Madrid…)",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const hits = useSearch<AirportHit>((s) => `/api/airports?q=${encodeURIComponent(s)}`, q, 2);
  return (
    <div>
      {value.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {value.map((code) => (
            <button key={code} type="button" className="chip chip-on" onClick={() => onChange(value.filter((v) => v !== code))}>
              <span className="font-mono">{code}</span> <X className="h-3.5 w-3.5" aria-label="Quitar" />
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <SearchInput value={q} onChange={setQ} placeholder={value.length ? "Añadir otro aeropuerto" : placeholder} />
        {q.length >= 2 && hits.length > 0 && (
          <ul className={LIST}>
            {hits.map((a) => (
              <li key={a.iata}>
                <button
                  type="button"
                  className={ITEM}
                  onClick={() => {
                    if (!value.includes(a.iata)) onChange([...value, a.iata]);
                    setQ("");
                  }}
                >
                  <b className="font-mono">{a.iata}</b> · {a.city || a.name}{" "}
                  <span className="text-muted">
                    ({a.name}, {a.country})
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function PlacePicker({
  value,
  onChange,
  placeholder = "Ciudad, pueblo o dirección",
}: {
  value: Place | undefined;
  onChange: (p: Place | undefined) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const hits = useSearch<Place & { kind?: string }>((s) => `/api/places?q=${encodeURIComponent(s)}`, q, 3);
  if (value) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-2xl border border-accent bg-accent-soft px-3.5 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-accent" />
          <span className="truncate font-medium">{value.label}</span>
        </span>
        <button type="button" className="shrink-0 font-medium text-accent" onClick={() => onChange(undefined)}>
          Cambiar
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <SearchInput value={q} onChange={setQ} placeholder={placeholder} />
      {q.length >= 3 && hits.length > 0 && (
        <ul className={LIST}>
          {hits
            .filter((p, i) => hits.findIndex((x) => x.label === p.label) === i)
            .map((p, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={`${ITEM} flex items-center gap-2`}
                  onClick={() => {
                    onChange({
                      label: p.label,
                      lat: p.lat,
                      lon: p.lon,
                      country: p.country,
                    });
                    setQ("");
                  }}
                >
                  <MapPin className="h-4 w-4 shrink-0 text-muted" />
                  {p.label}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

export function NearbyAirports({
  place,
  radiusKm,
  value,
  onChange,
}: {
  place: Place;
  radiusKm: number;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [list, setList] = useState<AirportHit[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/airports?lat=${place.lat}&lon=${place.lon}&radius=${radiusKm}`)
      .then((r) => r.json())
      .then((j: AirportHit[]) => !cancelled && setList(j))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [place.lat, place.lon, radiusKm]);
  if (!list.length) return <p className="hint">No hay aeropuertos en {radiusKm} km. Amplía la distancia o activa las rutas en tren o bus.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((a) => {
        const on = value.includes(a.iata);
        return (
          <button
            key={a.iata}
            type="button"
            aria-pressed={on}
            className={`chip ${on ? "chip-on" : ""}`}
            onClick={() => onChange(on ? value.filter((v) => v !== a.iata) : [...value, a.iata])}
            title={a.name}
          >
            <span className="font-mono font-medium">{a.iata}</span> {a.city || a.name} <span className="text-xs opacity-70">{a.km} km</span>
          </button>
        );
      })}
    </div>
  );
}

export function DateList({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [d, setD] = useState("");
  return (
    <div>
      <div className="flex gap-2">
        <input type="date" className="input" value={d} onChange={(e) => setD(e.target.value)} aria-label="Fecha" />
        <button
          type="button"
          className="btn-ghost shrink-0"
          disabled={!d}
          onClick={() => {
            if (d && !value.includes(d)) onChange([...value, d].sort());
            setD("");
          }}
        >
          <Plus className="h-4 w-4" /> Añadir
        </button>
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((x) => (
            <button key={x} type="button" className="chip chip-on" onClick={() => onChange(value.filter((v) => v !== x))}>
              {new Date(`${x}T00:00:00Z`).toLocaleDateString("es-ES", {
                weekday: "short",
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              })}
              <X className="h-3.5 w-3.5" aria-label="Quitar" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
