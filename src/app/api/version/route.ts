// Versión que está publicada ahora mismo. Las pestañas abiertas la consultan para recargarse cuando cambia.
export function GET() {
  return Response.json(
    { version: process.env.NEXT_PUBLIC_APP_VERSION ?? "local" },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
