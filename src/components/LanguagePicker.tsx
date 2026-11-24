"use client";

import { Globe, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { setLanguage } from "@/app/actions";
import { useLocale, useT } from "@/i18n/client";
import { LOCALE_NAMES, LOCALES } from "@/i18n/config";

/**
 * Selector de idioma. compact: solo el icono y el código (para la cabecera).
 * Al cambiar se recarga la página para que todo (también lo que viene del servidor) salga en el nuevo idioma.
 */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const t = useT("common");
  const [pending, start] = useTransition();
  return (
    <label className={`relative inline-flex items-center gap-2 ${compact ? "" : "w-full"}`}>
      <span className="sr-only">{t("language")}</span>
      {pending ? (
        <Loader2 className="pointer-events-none absolute start-3 h-4 w-4 animate-spin text-muted" />
      ) : (
        <Globe className="pointer-events-none absolute start-3 h-4 w-4 text-muted" />
      )}
      <select
        value={locale}
        disabled={pending}
        aria-label={t("language")}
        onChange={(e) => {
          const next = e.target.value;
          start(async () => {
            await setLanguage(next);
            window.location.reload();
          });
        }}
        className={`input appearance-none ps-9 ${compact ? "h-9 min-h-9 w-auto pe-3 text-xs font-semibold uppercase" : "pe-4"}`}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {compact ? l.toUpperCase() : LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
