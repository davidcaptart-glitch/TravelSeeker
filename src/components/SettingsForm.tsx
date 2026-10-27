"use client";

import { useActionState } from "react";
import { saveSettings, type FormState } from "@/app/actions";

export function SettingsForm({ email, country, region }: { email: string; country: string; region: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSettings, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Email para avisos (opcional)
        </label>
        <input id="email" name="email" type="email" className="input" defaultValue={email} placeholder="tu@email.com" />
        <p className="hint mt-1">Solo se usa si el servidor tiene configurado SMTP_URL.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="holidaysCountry">
            País de tus festivos
          </label>
          <input id="holidaysCountry" name="holidaysCountry" className="input uppercase" maxLength={2} defaultValue={country} />
        </div>
        <div>
          <label className="label" htmlFor="holidaysRegion">
            Comunidad / región (opcional)
          </label>
          <input id="holidaysRegion" name="holidaysRegion" className="input uppercase" defaultValue={region} placeholder="ES-CT, ES-MD, ES-AN…" />
        </div>
      </div>
      {state?.error && <p className="text-sm text-warn">{state.error}</p>}
      {state && !state.error && <p className="text-sm text-good">Guardado.</p>}
      <button className="btn-primary" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
