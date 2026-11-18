"use client";

import { Bookmark, BookmarkCheck, Check, Loader2, RotateCcw, Undo2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { decide } from "@/app/actions";
import type { MatchStatus } from "@/lib/types";

/**
 * Las decisiones sobre una oferta. La búsqueda sigue mientras no marques una como reservada:
 * descartar o guardar solo ordena tus opciones.
 */
export function MatchActions({ id, status, link }: { id: string; status: MatchStatus; link?: string }) {
  const [pending, start] = useTransition();
  const [doing, setDoing] = useState<MatchStatus | null>(null);
  const act = (s: MatchStatus) => {
    setDoing(s);
    start(() => decide(id, s));
  };
  const spin = (s: MatchStatus, Icon: typeof X) => (pending && doing === s ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />);

  if (status === "dismissed") {
    return (
      <div className="flex gap-2">
        <button type="button" className="btn-ghost min-h-10 flex-1" disabled={pending} onClick={() => act("new")}>
          {spin("new", RotateCcw)} Recuperar
        </button>
      </div>
    );
  }

  if (status === "booked") {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-quiet min-h-10 flex-1"
          disabled={pending}
          onClick={() => {
            if (confirm("¿Deshacer? La alerta volverá a buscar viajes.")) act("saved");
          }}
        >
          {spin("saved", Undo2)} No lo he reservado
        </button>
      </div>
    );
  }

  const book = () => {
    if (confirm("¡Genial! Marcamos este viaje como reservado y paramos de buscar en esta alerta. ¿Seguro?")) act("booked");
  };

  return (
    <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
      <button
        type="button"
        className="btn-ghost min-h-11 w-11 px-0 text-muted hover:text-danger"
        disabled={pending}
        onClick={() => act("dismissed")}
        aria-label="Descartar: no me viene bien"
        title="No me viene bien"
      >
        {spin("dismissed", X)}
      </button>
      {status === "saved" ? (
        <button type="button" className="btn-ghost min-h-11" disabled={pending} onClick={() => act("new")} title="Quitar de guardados">
          {spin("new", BookmarkCheck)} Guardado
        </button>
      ) : (
        <button type="button" className="btn-ghost min-h-11" disabled={pending} onClick={() => act("saved")}>
          {spin("saved", Bookmark)} Guardar
        </button>
      )}
      {link ? (
        // Reservar abre la web del vuelo; después se marca abajo con "Ya lo he reservado".
        <a href={link} target="_blank" rel="noreferrer" className="btn-primary min-h-11">
          Reservar
        </a>
      ) : (
        <button type="button" className="btn-primary min-h-11" disabled={pending} onClick={book}>
          {spin("booked", Check)} Lo cojo
        </button>
      )}
      {link && (
        <button type="button" className="btn-quiet col-span-3 min-h-9 text-xs" disabled={pending} onClick={book}>
          {spin("booked", Check)} Ya lo he reservado: dejar de buscar
        </button>
      )}
    </div>
  );
}
