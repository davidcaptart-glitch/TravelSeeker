"use client";

import { useActionState } from "react";
import { linkDevice, type FormState } from "@/app/actions";

export function LinkDeviceForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(linkDevice, undefined);
  return (
    <div className="space-y-3">
      <div>
        <p className="label">Tu identificador</p>
        <p className="select-all break-all rounded-xl bg-surface-2 px-3 py-2 font-mono text-sm">{userId}</p>
        <p className="hint mt-1">Guárdalo: con él recuperas tus alertas en otro móvil o si borras los datos del navegador.</p>
      </div>
      <form action={action} className="space-y-2">
        <label className="label" htmlFor="userId">
          Usar en este dispositivo las alertas de otro identificador
        </label>
        <div className="flex flex-wrap gap-2">
          <input id="userId" name="userId" className="input min-w-0 flex-1 font-mono" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          <button className="btn-ghost" disabled={pending}>
            {pending ? "Comprobando…" : "Usar"}
          </button>
        </div>
        {state?.error && <p className="text-sm text-warn">{state.error}</p>}
        <p className="hint">Después, vuelve a activar las notificaciones en este dispositivo.</p>
      </form>
    </div>
  );
}
