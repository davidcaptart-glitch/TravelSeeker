import { nearbyAirports, searchAirports } from "@/lib/geo";

// GET /api/airports?q=par  ó  /api/airports?lat=..&lon=..&radius=150
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  if (q) return Response.json(searchAirports(q));
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const radius = Math.min(500, Number(searchParams.get("radius") ?? 150));
  if (Number.isNaN(lat) || Number.isNaN(lon)) return Response.json([]);
  return Response.json(nearbyAirports(lat, lon, radius, 12).map((a) => ({ ...a, km: Math.round(a.km) })));
}
