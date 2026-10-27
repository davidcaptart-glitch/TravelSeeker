import { searchPlaces } from "@/lib/geo";

// GET /api/places?q=cap d'agde — proxy de geocodificación (Photon / OpenStreetMap).
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return Response.json([]);
  return Response.json(await searchPlaces(q).catch(() => []));
}
