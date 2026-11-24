"use client";

import { createContext, useContext, useMemo } from "react";
import { RTL_LOCALES, type Locale } from "./config";
import { makeT, type Translator } from "./core";
import { makeFormat, type Money } from "./format";
import type { LocaleBundle, Namespace, NsMessages } from "./messages";

type Ctx = { locale: Locale; messages: LocaleBundle };
const I18nContext = createContext<Ctx | null>(null);

/** Lo pone el layout con los textos del idioma elegido (solo ese idioma llega al navegador). */
export function I18nProvider({ locale, messages, children }: Ctx & { children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useCtx(): Ctx {
  const c = useContext(I18nContext);
  if (!c) throw new Error("Falta <I18nProvider>");
  return c;
}

// Moneda de la persona (la pone la página, que la lee en el servidor). Sin ella, euros.
const MoneyContext = createContext<Money | null>(null);

export function MoneyProvider({ money, children }: { money: Money; children: React.ReactNode }) {
  return <MoneyContext.Provider value={money}>{children}</MoneyContext.Provider>;
}

export function useLocale(): Locale {
  return useCtx().locale;
}

export function useIsRtl(): boolean {
  return RTL_LOCALES.includes(useCtx().locale);
}

/** Textos de un espacio de nombres: const t = useT("alertForm"); t("title", { n: 2 }). */
export function useT<N extends Namespace>(ns: N): Translator<NsMessages<N>> {
  const { locale, messages } = useCtx();
  return useMemo(() => makeT(locale, messages[ns] as NsMessages<N>), [locale, messages, ns]);
}

export function useFormat() {
  const { locale, messages } = useCtx();
  const money = useContext(MoneyContext);
  return useMemo(() => makeFormat(locale, messages.common, money ?? undefined), [locale, messages, money]);
}
