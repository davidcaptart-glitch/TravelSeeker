import { nearbyAirports } from "@/lib/geo";
import { budgetShare, recordFares, routeStats } from "@/lib/observations";
import { marketFares, monthlyTrend } from "@/lib/providers/flights";

/**
 * GET /api/history?origins=BCN,GRO&dests=FCO,CIA | lat=..&lon=..&radius=150&months=2027-02,2027-03
 *   &minNights=1&maxNights=3&maxStops=1&budget=60
 * Lo que ya sabemos de una ruta antes de crear la alerta: histórico guardado (todas las búsquedas) y,
 * si aún no hay, lo más barato del mercado en esos meses.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const list = (k: string) => (q.get(k) ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{3}$/.test(s));
  const origins = list("origins").slice(0, 5);
  let dests = list("dests").slice(0, 6);
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  if (!dests.length && Number.isFinite(lat) && Number.isFinite(lon) && q.get("lat")) {
    dests = nearbyAirports(lat, lon, Math.min(500, Number(q.get("radius")) || 150), 4).map((a) => a.iata);
  }
  dests = dests.filter((d) => !origins.includes(d));
  const months = (q.get("months") ?? "").split(",").filter((m) => /^\d{4}-\d{2}$/.test(m)).slice(0, 12);
  if (!origins.length || !dests.length || !months.length) return Response.json({ dests, stats: null, market: null });

  const minNights = Number(q.get("minNights") ?? 1);
  const maxNights = Number(q.get("maxNights") ?? 30);
  const maxStops = Number(q.get("maxStops") ?? 2);
  const budget = Number(q.get("budget")) || undefined;
  const opts = { months, minNights, maxNights, maxStops };

  let stats = await routeStats(origins, dests, opts).catch(() => null);
  // Ruta sin histórico: se consultan ahora los precios gratuitos de tus meses, se guardan y se vuelve a mirar.
  if (!stats) {
    const pairs = origins.flatMap((o) => dests.map((d) => [o, d] as const)).slice(0, 4);
    const fares = await Promise.all(pairs.flatMap(([o, d]) => months.slice(0, 3).map((m) => marketFares(o, d, m))));
    await recordFares(fares.flat());
    stats = await routeStats(origins, dests, opts).catch(() => null);
  }
  const share = stats && budget ? await budgetShare(origins, dests, opts, budget).catch(() => null) : null;

  // Mercado (precios en caché de Aviasales, gratis): lo más barato de cada uno de tus meses.
  const pairs = origins.flatMap((o) => dests.map((d) => [o, d] as const)).slice(0, 4);
  const trends = await Promise.all(pairs.map(([o, d]) => monthlyTrend(o, d).catch(() => ({}) as Record<string, number>)));
  const byMonth: Record<string, number> = {};
  for (const t of trends) for (const [m, p] of Object.entries(t)) if (months.includes(m)) byMonth[m] = Math.min(byMonth[m] ?? Infinity, p);
  const market = Object.keys(byMonth).length
    ? Object.entries(byMonth)
        .map(([month, price]) => ({ month, price }))
        .sort((a, b) => a.price - b.price)[0]
    : null;

  return Response.json({ dests, stats, budgetShare: share, market });
}
