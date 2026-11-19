// Países a los que pueden llevar los destinos de «Sorpréndeme» (ver THEMED_DESTINATIONS en geo.ts).
// Sin dependencias de servidor: lo usa también el formulario.
export const SURPRISE_COUNTRIES = [
  "AT", "BE", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GR",
  "HR", "HU", "IE", "IS", "IT", "LV", "MT", "NL", "NO", "PL", "PT", "RS", "TR",
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
