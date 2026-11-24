import { NextResponse, type NextRequest } from "next/server";
import { isLocale, LOCALE_COOKIE, matchLocale } from "@/i18n/config";
import { countryFromAcceptLanguage, CURRENCY_COOKIE, currencyForCountry, isCurrency } from "@/lib/currency";
import { USER_COOKIE, USER_COOKIE_OPTIONS } from "@/lib/identity";

/**
 * - Identidad sin registro: cada dispositivo recibe un id anónimo en una cookie.
 *   (Para cuentas con login bastaría con sustituir esto por un proveedor de autenticación.)
 * - Idioma: las direcciones no llevan idioma (/alerts); por dentro se sirven desde /es/alerts, /en/alerts…
 *   según el idioma elegido en Ajustes (cookie) o, si no has elegido, el de tu navegador.
 * - Moneda: la primera vez, la del país desde el que te conectas (Vercel lo da por IP) o la de la región
 *   de tu navegador; después, la que elijas en Ajustes.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];
  // Las páginas (no la API ni los archivos estáticos).
  const isPage = !pathname.startsWith("/api/") && !/\.[a-z0-9]+$/i.test(pathname);

  // Cookies nuevas: se añaden a la petición (para esta misma página) y a la respuesta (para las siguientes).
  const fresh: { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] }[] = [];
  if (!request.cookies.has(USER_COOKIE)) {
    fresh.push({ name: USER_COOKIE, value: crypto.randomUUID(), options: USER_COOKIE_OPTIONS });
  }
  if (isPage && !isCurrency(request.cookies.get(CURRENCY_COOKIE)?.value)) {
    const country = request.headers.get("x-vercel-ip-country") ?? countryFromAcceptLanguage(request.headers.get("accept-language"));
    fresh.push({
      name: CURRENCY_COOKIE,
      value: currencyForCountry(country) ?? "EUR",
      options: { path: "/", maxAge: 60 * 60 * 24 * 365 * 5, sameSite: "lax" },
    });
  }
  for (const c of fresh) request.cookies.set(c.name, c.value);
  const headers = new Headers(request.headers);
  if (fresh.length) headers.set("cookie", request.cookies.toString());

  let response: NextResponse;
  if (isPage && !isLocale(first)) {
    const saved = request.cookies.get(LOCALE_COOKIE)?.value;
    const locale = isLocale(saved) ? saved : matchLocale(request.headers.get("accept-language"));
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    response = NextResponse.rewrite(url, { request: { headers } });
  } else {
    response = NextResponse.next({ request: { headers } });
  }
  for (const c of fresh) response.cookies.set(c.name, c.value, c.options);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|icons|manifest.webmanifest).*)"],
};
