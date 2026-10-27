import { getHolidays } from "@/lib/holidays";
import { currentUser } from "@/lib/session";

// GET /api/holidays?years=2026,2027 — festivos del país/región del usuario (para previsualizar fechas).
export async function GET(request: Request) {
  const user = await currentUser();
  const years = (new URL(request.url).searchParams.get("years") ?? String(new Date().getFullYear()))
    .split(",")
    .map(Number)
    .filter((y) => y > 2000 && y < 2100)
    .slice(0, 3);
  const set = await getHolidays(user.holidaysCountry, years, user.holidaysRegion).catch(() => new Set<string>());
  return Response.json({ country: user.holidaysCountry, region: user.holidaysRegion, dates: [...set].sort() });
}
