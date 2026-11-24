"use client";

import { Coins, Loader2 } from "lucide-react";
import { useMemo, useTransition } from "react";
import { setCurrency } from "@/app/actions";
import { useLocale, useT } from "@/i18n/client";
import { INTL_TAG } from "@/i18n/config";
import { allCurrencies, POPULAR_CURRENCIES } from "@/lib/currency";

/** Selector de la moneda en la que ves los precios. Al cambiar se recarga para que todo salga convertido. */
export function CurrencyPicker({ value }: { value: string }) {
  const locale = useLocale();
  const t = useT("settings");
  const [pending, start] = useTransition();
  const options = useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([INTL_TAG[locale]], { type: "currency" });
    } catch {
      names = null;
    }
    return allCurrencies().map((c) => ({ code: c, label: `${c} · ${names?.of(c) ?? c}`, popular: POPULAR_CURRENCIES.includes(c) }));
  }, [locale]);
  return (
    <label className="relative flex w-full items-center">
      <span className="sr-only">{t("currencyTitle")}</span>
      {pending ? (
        <Loader2 className="pointer-events-none absolute start-3 h-4 w-4 animate-spin text-muted" />
      ) : (
        <Coins className="pointer-events-none absolute start-3 h-4 w-4 text-muted" />
      )}
      <select
        value={value}
        disabled={pending}
        aria-label={t("currencyTitle")}
        onChange={(e) => {
          const next = e.target.value;
          start(async () => {
            await setCurrency(next);
            window.location.reload();
          });
        }}
        className="input appearance-none ps-9 pe-4"
      >
        <optgroup label={t("currencyPopular")}>
          {options.filter((o) => o.popular).map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </optgroup>
        <optgroup label={t("currencyOthers")}>
          {options.filter((o) => !o.popular).map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}
