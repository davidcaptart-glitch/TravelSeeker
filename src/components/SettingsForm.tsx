"use client";

import { useActionState } from "react";
import { saveSettings, type FormState } from "@/app/actions";
import { useT } from "@/i18n/client";

export function SettingsForm({ email, country, region }: { email: string; country: string; region: string }) {
  const t = useT("settings");
  const [state, action, pending] = useActionState<FormState, FormData>(saveSettings, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          {t("emailLabel")}
        </label>
        <input id="email" name="email" type="email" className="input" defaultValue={email} placeholder={t("emailPlaceholder")} />
        <p className="hint mt-1">{t("emailHint")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="holidaysCountry">
            {t("countryLabel")}
          </label>
          <input id="holidaysCountry" name="holidaysCountry" className="input uppercase" maxLength={2} defaultValue={country} />
        </div>
        <div>
          <label className="label" htmlFor="holidaysRegion">
            {t("regionLabel")}
          </label>
          <input id="holidaysRegion" name="holidaysRegion" className="input uppercase" defaultValue={region} placeholder="ES-CT, ES-MD, ES-AN…" />
        </div>
      </div>
      {state?.error && <p className="text-sm text-warn">{state.error}</p>}
      {state && !state.error && <p className="text-sm text-good">{t("savedOk")}</p>}
      <button className="btn-primary" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </button>
    </form>
  );
}
