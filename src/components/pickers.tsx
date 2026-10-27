"use client";

import { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/types";

type AirportHit = { iata: string; name: string; city: string; country: string; km?: number };

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
      <div className="mb-2 flex flex-wrap gap-1.5">
        {value.map((code) => (
          <button key={code} type="button" className="chip chip-on" onClick={() => onChange(value.filter((v) => v !== code))}>
            {code} <span aria-hidden>×</span>
          </button>
        ))}
      </div>
      <div className="relative">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
        {q.length >= 2 && hits.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-surface shadow-lg">
            {hits.map((a) => (
              <li key={a.iata}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                  onClick={() => {
                    if (!value.includes(a.iata)) onChange([...value, a.iata]);
                    setQ("");
                  }}
                >
                  <b>{a.iata}</b> · {a.city || a.name} <span className="text-muted">({a.name}, {a.country})</span>
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
      <div className="flex items-center justify-between gap-2 rounded-xl border border-accent bg-accent-soft px-3 py-2 text-sm">
        <span>📍 {value.label}</span>
        <button type="button" className="text-accent underline" onClick={() => onChange(undefined)}>
          Cambiar
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      {q.length >= 3 && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-surface shadow-lg">
          {hits.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                onClick={() => {
                  onChange({ label: p.label, lat: p.lat, lon: p.lon, country: p.country });
                  setQ("");
                }}
              >
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
  if (!list.length) return <p className="hint">No hay aeropuertos en {radiusKm} km. Amplía el radio o activa rutas alternativas.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((a) => {
        const on = value.includes(a.iata);
        return (
          <button
            key={a.iata}
            type="button"
            className={`chip ${on ? "chip-on" : ""}`}
            onClick={() => onChange(on ? value.filter((v) => v !== a.iata) : [...value, a.iata])}
            title={a.name}
          >
            {a.iata} · {a.city || a.name} <span className="text-muted">{a.km} km</span>
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
        <input type="date" className="input" value={d} onChange={(e) => setD(e.target.value)} />
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            if (d && !value.includes(d)) onChange([...value, d].sort());
            setD("");
          }}
        >
          Añadir
        </button>
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((x) => (
            <button key={x} type="button" className="chip chip-on" onClick={() => onChange(value.filter((v) => v !== x))}>
              {new Date(`${x}T00:00:00Z`).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
