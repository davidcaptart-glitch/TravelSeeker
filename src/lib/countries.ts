// Países a los que pueden llevar los destinos de «Sorpréndeme» (ver THEMED_DESTINATIONS en geo.ts).
// Sin dependencias de servidor: lo usa también el formulario.
export const SURPRISE_COUNTRIES = [
  "AE", "AR", "AT", "AU", "AW", "BE", "BR", "CA", "CH", "CL", "CN", "CO", "CR", "CU",
  "CW", "CY", "CZ", "DE", "DK", "DO", "EC", "EE", "EG", "ES", "FI", "FJ", "FR", "GB",
  "GR", "HK", "HR", "HU", "ID", "IE", "IL", "IN", "IS", "IT", "JM", "JO", "JP", "KE",
  "KH", "KR", "LK", "LV", "MA", "MM", "MT", "MU", "MV", "MX", "MY", "NA", "NL", "NO",
  "NP", "NZ", "PA", "PE", "PF", "PH", "PL", "PR", "PT", "QA", "RS", "SC", "SG", "TH",
  "TN", "TR", "TW", "TZ", "US", "UY", "UZ", "VN", "ZA", "ZW",
] as const;

// Códigos de ciudad (agrupan varios aeropuertos) que no están en la lista de aeropuertos.
export const CITY_CODE_COUNTRY: Record<string, string> = { PAR: "FR", LON: "GB", ROM: "IT", MIL: "IT" };

let names: Intl.DisplayNames | null = null;
export function countryName(code: string): string {
  try {
    names ??= new Intl.DisplayNames(["es"], { type: "region" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}
