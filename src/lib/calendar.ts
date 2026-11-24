import type { Format } from "@/i18n/format";
import type { Translator } from "@/i18n/core";
import type { NsMessages } from "@/i18n/messages";
import { getAirport } from "./geo";
import type { FlightLeg, Match } from "./types";

/**
 * Eventos de calendario de un viaje cogido: cada vuelo (con su hora local) y el alojamiento (días completos).
 * Las horas van "flotantes" (sin zona horaria): el calendario las muestra tal cual, que es la hora local
 * del aeropuerto que aparece en el billete.
 */

export type CalEvent = {
  uid: string;
  title: string;
  // "AAAA-MM-DD" para días completos; "AAAA-MM-DDTHH:MM" para horas.
  start: string;
  end: string;
  allDay?: boolean;
  location?: string;
  description: string;
};

type T = Translator<NsMessages<"calendar">>;

const addMinutes = (date: string, time: string, min: number) => {
  const d = new Date(Date.parse(`${date}T${time}:00Z`) + min * 60_000);
  return d.toISOString().slice(0, 16);
};
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function airportName(code: string): string {
  const a = getAirport(code);
  return a ? `${a.name} (${code})` : code;
}

/** Fin de un vuelo: su hora de llegada (al día siguiente si aterriza "antes" de salir) o salida + duración. */
function flightEnd(date: string, depart: string, arrive?: string, arriveDate?: string, minutes?: number): string {
  if (arrive) {
    const d = arriveDate ?? (arrive < depart ? addDays(date, 1) : date);
    return `${d}T${arrive}`;
  }
  return addMinutes(date, depart, minutes ?? 120);
}

function flightEvent(id: string, leg: { from: string; to: string; airline?: string; date: string; depart: string; end: string; link?: string }, t: T, extra: string[]): CalEvent {
  return {
    uid: `${id}@travelseeker`,
    title: t("eventFlight", { from: leg.from, to: leg.to, airline: leg.airline ?? "" }).replace(/\s*\(\)\s*$/, ""),
    start: `${leg.date}T${leg.depart}`,
    end: leg.end,
    location: airportName(leg.from),
    description: [t("descFrom", { airport: airportName(leg.from) }), t("descTo", { airport: airportName(leg.to) }), ...extra, leg.link ? t("descLink", { url: leg.link }) : "", t("descLocal")]
      .filter(Boolean)
      .join("\n"),
  };
}

export function tripEvents(m: Match, t: T, f: Format): CalEvent[] {
  const { flight, hotel, window } = m.data;
  const events: CalEvent[] = [];
  const legs: FlightLeg[] | undefined = flight.legs;
  if (legs?.length) {
    legs.forEach((l, i) =>
      events.push(
        flightEvent(`${m.id}-leg${i}`, { from: l.from, to: l.to, airline: l.airline, date: l.date, depart: l.departTime, end: flightEnd(l.date, l.departTime, l.arriveTime, l.arriveDate), link: l.link }, t, [
          t("descPrice", { price: f.eur(l.price) }),
        ]),
      ),
    );
  } else {
    const price = [t("descPriceTrip", { price: f.eur(flight.price) })];
    if (flight.departTime) {
      events.push(
        flightEvent(`${m.id}-out`, { from: flight.origin, to: flight.destination, airline: flight.airline, date: flight.depart, depart: flight.departTime, end: flightEnd(flight.depart, flight.departTime, flight.arriveTime, undefined, flight.durationMinutes), link: flight.link }, t, price),
      );
    }
    if (flight.returnTime) {
      events.push(
        flightEvent(
          `${m.id}-back`,
          {
            from: flight.destination,
            to: flight.origin,
            airline: flight.airline,
            date: flight.ret,
            depart: flight.returnTime,
            end: flightEnd(flight.ret, flight.returnTime, flight.returnArriveTime, flight.returnArriveDate, flight.durationMinutes),
            link: flight.link,
          },
          t,
          price,
        ),
      );
    }
    // Sin horas (algunas fuentes no las dan): el viaje como días completos.
    if (!flight.departTime && !flight.returnTime) {
      events.push({
        uid: `${m.id}-trip@travelseeker`,
        title: t("eventTrip", { to: m.data.destinationLabel }),
        start: flight.depart,
        end: addDays(flight.ret, 1),
        allDay: true,
        description: [t("eventFlight", { from: flight.origin, to: flight.destination, airline: flight.airline ?? "" }), ...price, flight.link ? t("descLink", { url: flight.link }) : ""].filter(Boolean).join("\n"),
      });
    }
  }
  if (hotel && window.nights > 0) {
    events.push({
      uid: `${m.id}-stay@travelseeker`,
      title: t("eventStay", { name: hotel.name }),
      start: window.depart,
      end: window.ret, // el día de salida del hotel no cuenta (fin exclusivo)
      allDay: true,
      location: hotel.lat && hotel.lon ? `${hotel.name}, ${m.data.destinationLabel}` : m.data.destinationLabel,
      description: [
        t("descStay", { nights: f.nights(window.nights), total: f.eur(hotel.total) }),
        hotel.bookingLinks?.[0] || hotel.link ? t("descLink", { url: hotel.bookingLinks?.[0]?.url ?? hotel.link! }) : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }
  return events;
}

const compact = (s: string) => s.replace(/[-:]/g, "");
const gDate = (s: string, allDay?: boolean) => (allDay ? compact(s) : `${compact(s)}00`);

/** Enlace "Añadir a Google Calendar" para un evento (Google no admite varios eventos en un enlace). */
export function googleCalendarLink(e: CalEvent): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${gDate(e.start, e.allDay)}/${gDate(e.end, e.allDay)}`,
    details: e.description,
  });
  if (e.location) p.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${p}`;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Líneas de como mucho 75 octetos (RFC 5545), cortando sin partir caracteres.
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** Archivo .ics con todos los eventos (calendario de Apple, Outlook, Google, etc.). */
export function toIcs(events: CalEvent[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TravelSeeker//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      e.allDay ? `DTSTART;VALUE=DATE:${compact(e.start)}` : `DTSTART:${compact(e.start)}00`,
      e.allDay ? `DTEND;VALUE=DATE:${compact(e.end)}` : `DTEND:${compact(e.end)}00`,
      `SUMMARY:${esc(e.title)}`,
      `DESCRIPTION:${esc(e.description)}`,
      ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
      // Aviso 3 horas antes de cada vuelo.
      ...(e.allDay ? [] : ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, "TRIGGER:-PT3H", "END:VALARM"]),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
