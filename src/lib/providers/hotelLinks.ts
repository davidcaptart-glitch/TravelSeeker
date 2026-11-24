/**
 * Enlaces para reservar un alojamiento directamente en la web de cada agencia, con el alojamiento,
 * las fechas y las personas ya puestos (sus buscadores abren con ese hotel el primero).
 * Las agencias no dan el enlace exacto de cada hotel por API: se usa su búsqueda por nombre.
 */

export type StayQuery = { name: string; city: string; checkIn: string; checkOut: string; guests: number };

const rooms = (guests: number) => String(Math.max(1, Math.ceil(guests / 2)));
const nightsOf = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));

const SITES: Record<string, { label: string; url: (q: StayQuery) => string }> = {
  BookingCom: {
    label: "Booking.com",
    url: (q) =>
      `https://www.booking.com/searchresults.html?${new URLSearchParams({
        ss: `${q.name}, ${q.city}`,
        checkin: q.checkIn,
        checkout: q.checkOut,
        group_adults: String(q.guests),
        no_rooms: rooms(q.guests),
        group_children: "0",
      })}`,
  },
  Agoda: {
    label: "Agoda",
    url: (q) =>
      `https://www.agoda.com/search?${new URLSearchParams({
        textToSearch: `${q.name} ${q.city}`,
        checkIn: q.checkIn,
        los: String(nightsOf(q.checkIn, q.checkOut)),
        adults: String(q.guests),
        rooms: rooms(q.guests),
      })}`,
  },
  CtripTA: {
    label: "Trip.com",
    url: (q) =>
      `https://www.trip.com/hotels/list?${new URLSearchParams({
        keyword: `${q.name} ${q.city}`,
        checkin: q.checkIn.replaceAll("-", "/"),
        checkout: q.checkOut.replaceAll("-", "/"),
        adult: String(q.guests),
        crn: rooms(q.guests),
      })}`,
  },
  Expedia: {
    label: "Expedia",
    url: (q) =>
      `https://www.expedia.com/Hotel-Search?${new URLSearchParams({
        destination: `${q.name}, ${q.city}`,
        startDate: q.checkIn,
        endDate: q.checkOut,
        adults: String(q.guests),
        rooms: rooms(q.guests),
      })}`,
  },
  HotelsCom: {
    label: "Hotels.com",
    url: (q) =>
      `https://www.hotels.com/Hotel-Search?${new URLSearchParams({
        destination: `${q.name}, ${q.city}`,
        startDate: q.checkIn,
        endDate: q.checkOut,
        adults: String(q.guests),
        rooms: rooms(q.guests),
      })}`,
  },
};
// Variantes de código que usa TripAdvisor para la misma agencia.
const ALIAS: Record<string, string> = { HotelsCom2: "HotelsCom", ExpediaUS: "Expedia", Ctrip: "CtripTA", TripCom: "CtripTA" };

/** Google Hotels con el alojamiento buscado: compara precios e incluye la web oficial del hotel. */
export function googleHotelsLink(q: StayQuery): string {
  return `https://www.google.com/travel/search?${new URLSearchParams({ q: `${q.name} ${q.city}` })}`;
}

export type BookingLink = { label: string; url: string; pricePerNight?: number; official?: boolean };

/**
 * Enlaces de reserva a partir de los precios por agencia (código de TripAdvisor/Xotelo), del más barato al más caro.
 * La web oficial del hotel no tiene buscador común: se abre Google Hotels, que la enlaza.
 */
export function bookingLinksFor(q: StayQuery, rates: { code: string; name: string; rate: number }[]): BookingLink[] {
  const out: BookingLink[] = [];
  const seen = new Set<string>();
  for (const r of [...rates].sort((a, b) => a.rate - b.rate)) {
    const code = ALIAS[r.code] ?? r.code;
    const site = SITES[code];
    const official = /official/i.test(r.name);
    const label = site?.label ?? (official ? "official" : r.name);
    const url = site ? site.url(q) : googleHotelsLink(q);
    // Las agencias sin buscador propio abren Google Hotels: un solo botón para todas.
    if (seen.has(label) || out.some((o) => o.url === url)) continue;
    seen.add(label);
    out.push({ label, url, pricePerNight: Math.round(r.rate), official: official || undefined });
  }
  // Siempre al menos Booking.com.
  if (!seen.has("Booking.com")) out.push({ label: "Booking.com", url: SITES.BookingCom.url(q) });
  return out;
}
