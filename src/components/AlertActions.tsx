"use client";

import Link from "next/link";
import { useTransition } from "react";
import { removeAlert, runNow, toggleAlert } from "@/app/actions";

export function AlertActions({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn-primary" disabled={pending} onClick={() => start(() => runNow(id))}>
        {pending ? "Buscando…" : "Buscar ahora"}
      </button>
      <Link href={`/alerts/${id}/edit`} className="btn-ghost">
        Editar
      </Link>
      <button className="btn-ghost" disabled={pending} onClick={() => start(() => toggleAlert(id, !active))}>
        {active ? "Pausar" : "Reanudar"}
      </button>
      <button
        className="btn-ghost text-red-600"
        disabled={pending}
        onClick={() => {
          if (confirm("¿Borrar esta alerta y sus resultados?")) start(() => removeAlert(id));
        }}
      >
        Borrar
      </button>
    </div>
  );
}
