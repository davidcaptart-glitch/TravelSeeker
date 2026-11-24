import { formatFor, getLocale, getMoney, tFor } from "@/i18n/server";
import { toIcs, tripEvents } from "@/lib/calendar";
import { getMatch } from "@/lib/repo";
import { currentUserId } from "@/lib/session";

// Archivo .ics con el viaje (vuelos y alojamiento): al abrirlo se añade al calendario de Apple, Outlook, Google…
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  const m = await getMatch(id, await currentUserId());
  if (!m) return new Response(tFor(locale, "actions")("notFound"), { status: 404 });
  const ics = toIcs(tripEvents(m, tFor(locale, "calendar"), formatFor(locale, await getMoney())));
  const name = `travelseeker-${m.data.flight.destination}-${m.data.flight.depart}.ics`;
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
