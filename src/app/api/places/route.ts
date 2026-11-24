import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, matchLocale } from "@/i18n/config";
import { searchPlaces } from "@/lib/geo";

// GET /api/places?q=cap d'agde — proxy de geocodificación (Photon / OpenStreetMap).
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return Response.json([]);
  // Nombres y tipos de lugar en el idioma de quien busca: el elegido (cookie) o, si no, el del navegador.
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : matchLocale(request.headers.get("accept-language"));
  return Response.json(await searchPlaces(q, 7, locale).catch(() => []));
}
