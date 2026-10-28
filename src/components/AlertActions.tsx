"use client";

import { Loader2, Pause, Pencil, Play, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { removeAlert, runNow, toggleAlert } from "@/app/actions";
import { SearchingOverlay } from "./AlertForm";

export function AlertActions({ id, active }: { id: string; active: boolean }) {
  const [searching, startSearch] = useTransition();
  const [pending, start] = useTransition();
  const busy = searching || pending;
  return (
    <div className="flex items-center gap-2">
      {searching && <SearchingOverlay />}
      <button className="btn-primary flex-1 whitespace-nowrap sm:flex-none" disabled={busy} onClick={() => startSearch(() => runNow(id))}>
        {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {searching ? "Buscando…" : "Buscar ahora"}
      </button>
      <Link href={`/alerts/${id}/edit`} className="btn-ghost w-11 px-0 sm:w-auto sm:px-4" aria-label="Editar">
        <Pencil className="h-4 w-4" /> <span className="hidden sm:inline">Editar</span>
      </Link>
      <button
        className="btn-ghost w-11 px-0"
        disabled={busy}
        onClick={() => start(() => toggleAlert(id, !active))}
        aria-label={active ? "Pausar" : "Reanudar"}
        title={active ? "Pausar" : "Reanudar"}
      >
        {active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <button
        className="btn-ghost w-11 px-0 text-danger"
        disabled={busy}
        aria-label="Borrar"
        title="Borrar"
        onClick={() => {
          if (confirm("¿Borrar esta alerta y sus resultados?")) start(() => removeAlert(id));
        }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
