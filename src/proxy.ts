import { NextResponse, type NextRequest } from "next/server";

// Identidad sin registro: cada dispositivo recibe un id anónimo en una cookie.
// (Para cuentas con login bastaría con sustituir esto por un proveedor de autenticación.)
export const USER_COOKIE = "ts_uid";

export function proxy(request: NextRequest) {
  if (request.cookies.has(USER_COOKIE)) return NextResponse.next();
  const id = crypto.randomUUID();
  request.cookies.set(USER_COOKIE, id);
  const response = NextResponse.next({ request: { headers: new Headers(request.headers) } });
  response.cookies.set({
    name: USER_COOKIE,
    value: id,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 400,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|icons|manifest.webmanifest).*)"],
};
