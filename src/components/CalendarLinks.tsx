import { BedDouble, CalendarPlus, Download, PlaneLanding, PlaneTakeoff } from "lucide-react";
import { getFormat, getT } from "@/i18n/server";
import { googleCalendarLink, tripEvents } from "@/lib/calendar";
import type { Match } from "@/lib/types";

/** Para un viaje cogido: añadir los vuelos y el alojamiento a Google Calendar o descargar el .ics (Apple, Outlook). */
export async function CalendarLinks({ m }: { m: Match }) {
  const [t, f] = await Promise.all([getT("calendar"), getFormat()]);
  const events = tripEvents(m, t, f);
  if (!events.length) return null;
  const legs = events.filter((e) => e.uid.includes("-leg"));
  const label = (uid: string, i: number) => {
    if (uid.includes("-stay")) return { text: t("googleStay"), Icon: BedDouble };
    if (uid.includes("-out")) return { text: t("googleOut"), Icon: PlaneTakeoff };
    if (uid.includes("-back")) return { text: t("googleBack"), Icon: PlaneLanding };
    if (uid.includes("-trip")) return { text: t("googleTrip"), Icon: PlaneTakeoff };
    return { text: t("googleLeg", { n: i + 1 }), Icon: PlaneTakeoff };
  };
  return (
    <section className="mx-4 mb-4 rounded-2xl bg-good-soft p-3.5 sm:mx-5">
      <p className="flex items-center gap-2 font-semibold text-good">
        <CalendarPlus className="h-4 w-4" /> {t("title")}
      </p>
      <p className="hint mt-1">{t("hint")}</p>
      <div className="mt-3 space-y-2">
        <p className="text-xs font-semibold text-muted">Google Calendar</p>
        <div className="flex flex-wrap gap-2">
          {events.map((e) => {
            const { text, Icon } = label(e.uid, legs.indexOf(e));
            return (
              <a key={e.uid} href={googleCalendarLink(e)} target="_blank" rel="noreferrer" className="btn-ghost min-h-9 px-3 text-xs">
                <Icon className="h-3.5 w-3.5" /> {text}
              </a>
            );
          })}
        </div>
        <a href={`/api/matches/${m.id}/calendar`} className="btn-primary mt-1 min-h-10 w-full px-4 text-sm sm:w-auto">
          <Download className="h-4 w-4" /> {t("apple")}
        </a>
        <p className="hint">{t("appleHint")}</p>
      </div>
    </section>
  );
}
