// Monedas de la app. Por dentro todo se compara en euros (la moneda en la que dan los precios las
// fuentes); a cada persona se le enseña en la suya, con el cambio del día. Sin dependencias de servidor.

export const CURRENCY_COOKIE = "currency";
export const BASE_CURRENCY = "EUR";

// Moneda de cada país (ISO 3166 → ISO 4217).
const EURO = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK", "AD", "MC", "SM", "VA", "ME", "XK"];
export const COUNTRY_CURRENCY: Record<string, string> = {
  ...Object.fromEntries(EURO.map((c) => [c, "EUR"])),
  GB: "GBP", CH: "CHF", LI: "CHF", NO: "NOK", SE: "SEK", DK: "DKK", IS: "ISK", PL: "PLN", CZ: "CZK", HU: "HUF",
  RO: "RON", BG: "BGN", RS: "RSD", BA: "BAM", MK: "MKD", AL: "ALL", MD: "MDL", UA: "UAH", BY: "BYN", RU: "RUB",
  TR: "TRY", GE: "GEL", AM: "AMD", AZ: "AZN", KZ: "KZT", UZ: "UZS",
  US: "USD", CA: "CAD", MX: "MXN", GT: "GTQ", HN: "HNL", NI: "NIO", CR: "CRC", PA: "USD", SV: "USD", BZ: "BZD",
  CU: "CUP", DO: "DOP", PR: "USD", JM: "JMD", HT: "HTG", TT: "TTD", BS: "BSD", BB: "BBD",
  CO: "COP", VE: "VES", EC: "USD", PE: "PEN", BO: "BOB", CL: "CLP", AR: "ARS", UY: "UYU", PY: "PYG", BR: "BRL",
  MA: "MAD", DZ: "DZD", TN: "TND", EG: "EGP", NG: "NGN", GH: "GHS", SN: "XOF", CI: "XOF", CM: "XAF", KE: "KES",
  TZ: "TZS", UG: "UGX", ET: "ETB", RW: "RWF", ZA: "ZAR", NA: "NAD", BW: "BWP", ZM: "ZMW", MU: "MUR", MG: "MGA",
  AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR", JO: "JOD", LB: "LBP", IL: "ILS", IQ: "IQD", IR: "IRR",
  IN: "INR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR", MV: "MVR",
  CN: "CNY", HK: "HKD", MO: "MOP", TW: "TWD", JP: "JPY", KR: "KRW", MN: "MNT",
  TH: "THB", VN: "VND", KH: "KHR", LA: "LAK", MM: "MMK", MY: "MYR", SG: "SGD", ID: "IDR", PH: "PHP", BN: "BND",
  AU: "AUD", NZ: "NZD", FJ: "FJD", PG: "PGK",
};

// Las que salen primero en el selector (las más usadas); el resto, por orden alfabético.
export const POPULAR_CURRENCIES = [
  "EUR", "USD", "GBP", "MXN", "BRL", "ARS", "COP", "CLP", "PEN", "CAD", "CHF", "JPY", "CNY", "KRW", "INR", "IDR",
  "RUB", "TRY", "AED", "SAR", "AUD", "PLN", "SEK", "NOK", "DKK", "CZK", "HUF", "RON", "MAD", "EGP", "ZAR", "THB",
];

export function allCurrencies(): string[] {
  const rest = [...new Set(Object.values(COUNTRY_CURRENCY))].filter((c) => !POPULAR_CURRENCIES.includes(c)).sort();
  return [...POPULAR_CURRENCIES, ...rest];
}

export function isCurrency(x: unknown): x is string {
  return typeof x === "string" && /^[A-Z]{3}$/.test(x) && allCurrencies().includes(x);
}

export function currencyForCountry(country: string | null | undefined): string | undefined {
  return country ? COUNTRY_CURRENCY[country.toUpperCase()] : undefined;
}

/** País de la cabecera Accept-Language ("es-MX,es;q=0.9" → "MX"), si la trae. */
export function countryFromAcceptLanguage(h: string | null | undefined): string | undefined {
  const m = h?.match(/[a-z]{2,3}-([A-Z]{2})\b/i);
  return m?.[1].toUpperCase();
}
