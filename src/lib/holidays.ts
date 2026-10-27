import { cached } from "./db";

type NagerHoliday = { date: string; localName: string; global: boolean; counties: string[] | null };

// Festivos oficiales (API gratuita Nager.Date). region: código ISO 3166-2, p. ej. "ES-CT".
export async function getHolidays(country: string, years: number[], region?: string | null): Promise<Set<string>> {
  const out = new Set<string>();
  for (const year of years) {
    const list = await cached(`holidays:${country}:${year}`, 30 * 86400, async () => {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
      if (!res.ok) return [] as NagerHoliday[];
      return (await res.json()) as NagerHoliday[];
    });
    for (const h of list) {
      if (h.global || !h.counties || (region && h.counties.includes(region))) out.add(h.date);
    }
  }
  return out;
}
