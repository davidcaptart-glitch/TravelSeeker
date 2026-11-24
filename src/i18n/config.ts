// Idiomas de la app. Sin dependencias de servidor: lo usan también el proxy y la interfaz.

export const LOCALES = ["es", "en", "pt", "fr", "it", "de", "zh", "ja", "ko", "ar", "ru", "hi", "id"] as const;
export type Locale = (typeof LOCALES)[number];

// Si el navegador no pide ninguno de nuestros idiomas, inglés.
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lang";

// Cada idioma escrito en su propio idioma (así se reconoce en el selector).
export const LOCALE_NAMES: Record<Locale, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
  fr: "Français",
  it: "Italiano",
  de: "Deutsch",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  ar: "العربية",
  ru: "Русский",
  hi: "हिन्दी",
  id: "Bahasa Indonesia",
};

// Etiqueta para Intl (fechas, números, plurales). Árabe con cifras occidentales para leer bien los precios.
export const INTL_TAG: Record<Locale, string> = {
  es: "es-ES",
  en: "en-GB",
  pt: "pt-BR",
  fr: "fr-FR",
  it: "it-IT",
  de: "de-DE",
  zh: "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
  ar: "ar-u-nu-latn",
  ru: "ru-RU",
  hi: "hi-IN",
  id: "id-ID",
};

export const RTL_LOCALES: readonly Locale[] = ["ar"];

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as readonly string[]).includes(x);
}

/** Mejor idioma según la cabecera Accept-Language del navegador ("pt-BR,pt;q=0.9,en;q=0.8"). */
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const wanted = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q) : 1 };
    })
    .filter((x) => x.lang && !Number.isNaN(x.q))
    .sort((a, b) => b.q - a.q);
  for (const w of wanted) if (isLocale(w.lang)) return w.lang;
  return DEFAULT_LOCALE;
}
