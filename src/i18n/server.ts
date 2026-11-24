import "server-only";
import { cookies, headers } from "next/headers";
import { lang } from "next/root-params";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, matchLocale, type Locale } from "./config";
import { makeT, type Translator } from "./core";
import { makeFormat, type Money } from "./format";
import { BASE_CURRENCY, CURRENCY_COOKIE, isCurrency } from "@/lib/currency";
import { rateFor } from "@/lib/rates";
import { MESSAGES, type Namespace, type NsMessages } from "./messages";

/**
 * Idioma de la petición actual. En páginas y layouts sale de la ruta (/es/…, /en/…, que el proxy
 * añade según tu elección o tu navegador). En acciones de servidor, de la cookie.
 */
export async function getLocale(): Promise<Locale> {
  try {
    const l = await lang();
    if (isLocale(l)) return l;
  } catch {
    // Acciones de servidor y rutas de API: no tienen parámetros de ruta.
  }
  try {
    const c = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(c)) return c;
    // Sin idioma elegido: el del navegador, igual que hace el proxy con las páginas.
    return matchLocale((await headers()).get("accept-language"));
  } catch {
    // Fuera de una petición (tareas en segundo plano).
  }
  return DEFAULT_LOCALE;
}

/** Textos de un espacio de nombres en el idioma de la petición: const t = await getT("home"); t("title"). */
export async function getT<N extends Namespace>(ns: N): Promise<Translator<NsMessages<N>>> {
  return tFor(await getLocale(), ns);
}

/** Textos en un idioma concreto (avisos y búsquedas en segundo plano: el idioma de cada usuario). */
export function tFor<N extends Namespace>(locale: Locale, ns: N): Translator<NsMessages<N>> {
  const m = MESSAGES[ns] as unknown as Record<Locale, NsMessages<N>>;
  return makeT(locale, m[locale], m.es);
}

/** Moneda de la petición (cookie; la pone el proxy según tu zona o la eliges en Ajustes) y su cambio. */
export async function getMoney(): Promise<Money> {
  let currency = BASE_CURRENCY;
  try {
    const c = (await cookies()).get(CURRENCY_COOKIE)?.value;
    if (isCurrency(c)) currency = c;
  } catch {
    // Fuera de una petición.
  }
  return moneyFor(currency);
}

/** Moneda concreta con el cambio del día (los avisos en segundo plano usan la de cada usuario). */
export async function moneyFor(currency: string | null | undefined): Promise<Money> {
  if (!currency || !isCurrency(currency)) return { currency: BASE_CURRENCY, rate: 1 };
  const rate = await rateFor(currency);
  return rate ? { currency, rate } : { currency: BASE_CURRENCY, rate: 1 };
}

export async function getFormat() {
  const [locale, money] = await Promise.all([getLocale(), getMoney()]);
  return formatFor(locale, money);
}

export function formatFor(locale: Locale, money?: Money) {
  return makeFormat(locale, MESSAGES.common[locale], money);
}
