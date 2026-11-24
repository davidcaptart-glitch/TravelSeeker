import { INTL_TAG, type Locale } from "./config";

/**
 * Traducción sin dependencias, válida en servidor y cliente.
 *  - Variables: "Hola {name}".
 *  - Plurales (formato ICU, con las reglas de cada idioma): "{n, plural, =0 {ninguna} one {# noche} other {# noches}}".
 */

export type Params = Record<string, string | number>;
export type Translator<M> = (key: Extract<keyof M, string>, params?: Params) => string;

/** Un mensaje por idioma: todos los idiomas deben tener las mismas claves que el español. */
export function defineMessages<T extends Record<string, string>>(
  m: { es: T } & Record<Exclude<Locale, "es">, { [K in keyof T]: string }>,
): Record<Locale, T> {
  return m as Record<Locale, T>;
}

function branches(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    const start = i;
    while (i < s.length && s[i] !== "{" && !/\s/.test(s[i])) i++;
    const sel = s.slice(start, i);
    while (i < s.length && s[i] !== "{") i++;
    if (i >= s.length || !sel) break;
    let depth = 0;
    const open = i;
    for (; i < s.length; i++) {
      if (s[i] === "{") depth++;
      else if (s[i] === "}" && --depth === 0) break;
    }
    out[sel] = s.slice(open + 1, i);
    i++;
  }
  return out;
}

export function interpolate(tpl: string, params: Params | undefined, locale: Locale): string {
  let out = "";
  let i = 0;
  while (i < tpl.length) {
    if (tpl[i] !== "{") {
      out += tpl[i++];
      continue;
    }
    let depth = 0;
    let j = i;
    for (; j < tpl.length; j++) {
      if (tpl[j] === "{") depth++;
      else if (tpl[j] === "}" && --depth === 0) break;
    }
    const inner = tpl.slice(i + 1, j);
    i = j + 1;
    const plural = inner.match(/^\s*(\w+)\s*,\s*plural\s*,([\s\S]*)$/);
    if (plural) {
      const n = Number(params?.[plural[1]] ?? 0);
      const b = branches(plural[2]);
      let cat = `=${n}`;
      if (b[cat] === undefined) {
        try {
          cat = new Intl.PluralRules(INTL_TAG[locale]).select(n);
        } catch {
          cat = n === 1 ? "one" : "other";
        }
      }
      const text = b[cat] ?? b.other ?? "";
      out += interpolate(text.replace(/#/g, new Intl.NumberFormat(INTL_TAG[locale]).format(n)), params, locale);
    } else {
      const v = params?.[inner.trim()];
      out += v === undefined ? `{${inner}}` : String(v);
    }
  }
  return out;
}

export function makeT<M extends Record<string, string>>(locale: Locale, messages: M | undefined, fallback?: M): Translator<M> {
  return (key, params) => interpolate(messages?.[key] ?? fallback?.[key] ?? key, params, locale);
}
