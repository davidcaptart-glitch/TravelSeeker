import { makeT } from "../i18n/core";
import { makeFormat } from "../i18n/format";
import { MESSAGES } from "../i18n/messages";
import { dayTripFits, effectiveTimes, generateWindows, monthsOf } from "./dates";
import { airports, cityCenter, getAirport, haversineKm, nearbyAirports, THEMED_DESTINATIONS } from "./geo";
import { CITY_CODE_COUNTRY } from "./countries";
import { getHolidays } from "./holidays";
import { notifyUser } from "./notify";
import { rateFor } from "./rates";
import { cheaperThanShare, pruneObservations, recordFares, routeStats } from "./observations";
import { findCombos } from "./providers/combos";
import { confirm, flightProviders, monthlyTrend, screen } from "./providers/flights";
import { groundOptions, lastMile } from "./providers/ground";
import { searchHotels } from "./providers/hotels";
import { ALLOW_MOCK } from "./providers/mock";
import { addPricePoint, decidedTrips, deleteSimulatedMatches, dueAlerts, ensureUser, pruneMatches, saveRun, upsertMatch } from "./repo";
import type { Alert, AlertConfig, FlightOffer, MatchData, Place, RunSummary, TripWindow } from "./types";

// Búsquedas de pago (SerpApi) por ejecución; las de Ryanair no cuentan.
const CONFIRM_PER_RUN = Number(process.env.CONFIRM_PER_RUN ?? 4);
// Candidatos que se revisan como mucho por ejecución (la mayoría se resuelven gratis o desde la caché).
const MAX_CANDIDATES = 40;
// Opciones que se preparan por búsqueda: siempre varias, para que puedas elegir o descartar.
const MAX_MATCHES_PER_RUN = 6;
// Los precios en caché pueden estar algo desfasados: dejamos pasar candidatos un 15 % por encima.
const SCREEN_TOLERANCE = 1.15;

// Un aeropuerto de llegada solo tiene sentido si el vuelo te acerca de verdad al destino:
// no volar a un aeropuerto a menos de 150 km de casa, ni a uno que deje más de la mitad del camino por tierra.
function worthFlying(origin: string, dest: string, place: Place | null): boolean {
  const o = getAirport(origin);
  const d = getAirport(dest);
  if (!o || !d || !place) return true;
  const flown = haversineKm(o.lat, o.lon, d.lat, d.lon);
  const total = haversineKm(o.lat, o.lon, place.lat, place.lon);
  const rest = haversineKm(d.lat, d.lon, place.lat, place.lon);
  return flown >= 150 && rest <= total * 0.5;
}

function destinationAirports(alert: Alert): string[] | null {
  const c = alert.config;
  if (c.destination.kind === "anywhere") return null;
  if (c.destinationAirports.length) return c.destinationAirports;
  const { lat, lon } = c.destination.place;
  const near = nearbyAirports(lat, lon, c.airportRadiusKm, 4).map((a) => a.iata);
  if (c.allowGround) {
    // Rutas alternativas: aeropuertos grandes más lejanos + tren/bus hasta el destino.
    const far = nearbyAirports(lat, lon, 400, 20)
      .filter((a) => a.large && !near.includes(a.iata))
      .slice(0, 3)
      .map((a) => a.iata);
    near.push(...far);
  }
  return near;
}

function anywhereSet(alert: Alert): Set<string> | null {
  const d = alert.config.destination;
  if (d.kind !== "anywhere") return null;
  const themes = d.themes.length ? d.themes : [];
  const regions = d.regions ?? []; // las alertas guardadas antes no lo tienen
  const regionOf = (code: string) => getAirport(code)?.region ?? (CITY_CODE_COUNTRY[code] ? "europe" : "");
  let codes = themes.length ? themes.flatMap((t) => THEMED_DESTINATIONS[t] ?? []) : Object.values(THEMED_DESTINATIONS).flat();
  if (regions.length) {
    codes = codes.filter((c) => (regions as string[]).includes(regionOf(c)));
    // Sin temas, en las regiones elegidas vale cualquier aeropuerto grande (no solo los destinos populares).
    if (!themes.length) codes.push(...airports.filter((a) => a.large && (regions as string[]).includes(a.region)).map((a) => a.iata));
  }
  const countryOf = (code: string) => getAirport(code)?.country ?? CITY_CODE_COUNTRY[code] ?? "";
  const only = d.countries ?? [];
  const excluded = d.excludeCountries ?? []; // las alertas guardadas antes no lo tienen
  if (only.length) codes = codes.filter((c) => only.includes(countryOf(c)));
  if (excluded.length) codes = codes.filter((c) => !excluded.includes(countryOf(c)));
  return new Set(codes);
}

async function destinationPlace(alert: Alert, offer: FlightOffer): Promise<Place> {
  const d = alert.config.destination;
  if (d.kind === "place") return d.place;
  const a = getAirport(offer.destination);
  if (!a) return { label: offer.destination, lat: 0, lon: 0 };
  // En «Sorpréndeme» el destino es la ciudad (su centro), no el aeropuerto.
  const c = await cityCenter(a);
  return { label: c.city || a.name, lat: c.lat, lon: c.lon, country: a.country };
}

function flightOk(o: FlightOffer, alert: Alert, tolerance = 1): boolean {
  const f = alert.config.flight;
  if (o.price && o.price > f.maxPrice * tolerance) return false;
  // En un combinado, la escala propia no cuenta: se mira cada tramo por separado.
  const stops = o.legs ? Math.max(...o.legs.map((l) => l.stops)) : o.stops;
  if (stops > f.maxStops) return false;
  if (f.maxDurationHours && o.durationMinutes && o.durationMinutes > f.maxDurationHours * 60) return false;
  return true;
}

/**
 * Horarios: franjas de salida de la ida y de la vuelta, y los límites de un rango de días concretos.
 * Si no se conoce la hora de un vuelo (algunas fuentes no la dan) no se descarta.
 */
function timesOk(o: FlightOffer, w: TripWindow | undefined, t: AlertConfig["dates"]["times"]): boolean {
  const legs = o.legs;
  const split = legs ? legs.findIndex((l) => l.to === o.destination) + 1 : 0;
  const out = legs ? { date: legs[0].date, time: legs[0].departTime } : { date: o.depart, time: o.departTime };
  const back = legs ? { date: legs[split]?.date ?? o.ret, time: legs[split]?.departTime } : { date: o.ret, time: o.returnTime };
  const inBand = (time?: string, from?: string, to?: string) => !time || ((!from || time >= from) && (!to || time <= to));
  if (!inBand(out.time, t?.outFrom, t?.outTo) || !inBand(back.time, t?.backFrom, t?.backTo)) return false;
  if (w?.earliest) {
    const [d, h] = w.earliest.split("T");
    if (out.date < d || (out.date === d && out.time && out.time < h)) return false;
  }
  if (w?.latestReturn) {
    const [d, h] = w.latestReturn.split("T");
    if (back.date > d || (back.date === d && back.time && back.time > h)) return false;
  }
  return true;
}

export async function runAlert(alert: Alert): Promise<RunSummary> {
  const c = alert.config;
  const notes: string[] = [];
  const summary: RunSummary = {
    at: new Date().toISOString(),
    windows: 0,
    screened: 0,
    candidates: 0,
    confirmed: 0,
    flightMatches: 0,
    fullMatches: 0,
    notified: 0,
    notes,
  };

  const user = await ensureUser(alert.userId);
  // Sin petición en segundo plano: las notas y avisos van en el idioma del usuario.
  // (Igual que tFor/formatFor de @/i18n/server, que no se puede importar desde el worker: usa "server-only".)
  const t = makeT(user.locale, MESSAGES.engine[user.locale], MESSAGES.engine.es);
  // Precios de los avisos en la moneda del usuario (con el cambio del día).
  const rate = await rateFor(user.currency).catch(() => null);
  const f = makeFormat(user.locale, MESSAGES.common[user.locale], rate ? { currency: user.currency, rate } : undefined);
  const years = [...new Set(c.dates.months.map((m) => Number(m.slice(0, 4))))];
  const holidays = c.dates.useHolidays
    ? await getHolidays(user.holidaysCountry, years, user.holidaysRegion).catch(() => new Set<string>())
    : new Set<string>();
  const windows = generateWindows(c.dates, holidays);
  summary.windows = windows.length;
  if (!windows.length) {
    notes.push(t("noWindows"));
    await saveRun(alert.id, summary);
    return summary;
  }
  const times = effectiveTimes(c.dates);
  const dayTrip = Boolean(c.dates.dayTrip);
  const windowByKey = new Map(windows.map((w) => [`${w.depart}_${w.ret}`, w]));
  if (!ALLOW_MOCK) await deleteSimulatedMatches(alert.id);

  // 1) Cribado barato con precios en caché.
  const dests = destinationAirports(alert);
  const anyCodes = anywhereSet(alert);
  if (dests && !dests.length) notes.push(t("noAirports"));
  if (anyCodes && !anyCodes.size) notes.push(t("noSurprise"));
  const raw: FlightOffer[] = [];
  const targetPlace = c.destination.kind === "place" ? c.destination.place : null;
  const uncovered: string[] = [];
  for (const origin of c.origins) {
    for (const dest of dests ?? [null]) {
      if (dest === origin) continue;
      // Los aeropuertos elegidos a mano se respetan siempre; los automáticos se filtran.
      if (dest && !c.destinationAirports.length && !worthFlying(origin, dest, targetPlace)) continue;
      const before = raw.length;
      for (const month of monthsOf(windows)) {
        try {
          raw.push(
            ...(await screen(origin, dest, month, windows, anyCodes ? [...anyCodes].slice(0, 12) : [], c.flight.passengers)),
          );
        } catch (err) {
          notes.push(t("screenError", { route: `${origin}→${dest ?? t("anywhere")}`, month: f.month(month), error: (err as Error).message }));
        }
      }
      if (raw.length === before) uncovered.push(`${origin}→${dest ?? t("anywhere")}`);
    }
  }
  summary.screened = raw.length;
  // Todo lo visto se guarda en el histórico de trabajo (para comparar precios y ahorrar búsquedas).
  await recordFares(raw);
  // Sin más fuentes que Ryanair, una ruta sin precios es casi siempre una ruta que Ryanair no vuela.
  if (flightProviders.screen === "ryanair" && uncovered.length) {
    notes.push(t("ryanairOnly", { routes: uncovered.join(", ") }));
  }

  const best = new Map<string, FlightOffer>();
  for (const o of raw) {
    if (anyCodes && !anyCodes.has(o.destination)) continue;
    // Fechas parecidas (mismos meses y noches, cualquier día de la semana): para saber si tu precio es realista.
    const nights = Math.round((Date.parse(o.ret) - Date.parse(o.depart)) / 86_400_000);
    if (
      o.destination !== o.origin &&
      o.stops <= c.flight.maxStops &&
      o.price > 0 &&
      c.dates.months.includes(o.depart.slice(0, 7)) &&
      (dayTrip ? nights === 0 : nights >= c.dates.minNights && nights <= c.dates.maxNights)
    ) {
      summary.cheapestSimilar = Math.min(summary.cheapestSimilar ?? Infinity, o.price);
    }
    if (!windowByKey.has(`${o.depart}_${o.ret}`)) continue;
    // Para el histórico: lo más barato en tus fechas aunque supere tu precio (sí respeta las escalas).
    if (o.destination !== o.origin && o.stops <= c.flight.maxStops && o.price > 0) {
      summary.cheapestForDates = Math.min(summary.cheapestForDates ?? Infinity, o.price);
    }
    if (o.destination === o.origin || !flightOk(o, alert, SCREEN_TOLERANCE)) continue;
    if (!timesOk(o, windowByKey.get(`${o.depart}_${o.ret}`), times) || !dayTripFits(o, c.dates)) continue;
    const k = `${o.origin}|${o.destination}|${o.depart}|${o.ret}`;
    const prev = best.get(k);
    if (!prev || o.price < prev.price) best.set(k, o);
  }
  // Vuelos combinados: dos billetes enlazados en otra ciudad que elige la app, si salen más baratos.
  // (En un viaje de un día no compensa: no da tiempo a enlazar dos vuelos a la ida y otros dos a la vuelta.)
  if (c.flight.selfTransfer !== false && dests?.length && !dayTrip) {
    try {
      const combos = await findCombos({
        origins: c.origins,
        destinations: dests,
        windows,
        adults: c.flight.passengers,
        maxStops: c.flight.maxStops,
        maxPrice: c.flight.maxPrice,
      });
      let added = 0;
      for (const o of combos) {
        if (!flightOk(o, alert, SCREEN_TOLERANCE)) continue;
        if (!timesOk(o, windowByKey.get(`${o.depart}_${o.ret}`), times)) continue;
        const k = `${o.origin}|${o.destination}|${o.depart}|${o.ret}`;
        const direct = best.get(k);
        // Solo si ahorra de verdad frente al vuelo normal de esas fechas (al menos un 10 %).
        if (direct && o.price > direct.price * 0.9) continue;
        best.set(`${k}|via:${o.via!.join("+")}`, o);
        added++;
      }
      summary.combos = added;
      await recordFares(combos);
    } catch (err) {
      notes.push(t("combosError", { error: (err as Error).message }));
    }
  }

  // Lo que ya has descartado o cogido no se vuelve a confirmar ni a ofrecer: deja sitio a otras opciones.
  const decided = await decidedTrips(alert.id);
  for (const k of best.keys()) if (decided.has(k)) best.delete(k);
  const candidates = [...best.values()].sort((a, b) => a.price - b.price || a.depart.localeCompare(b.depart));
  summary.candidates = candidates.length;

  // 2) Confirmación en vivo: gratis con Ryanair; las de pago (SerpApi) solo para los mejores CONFIRM_PER_RUN.
  const confirmed: FlightOffer[] = [];
  let paid = 0;
  let quotaHit = false;
  let bestTotal = Infinity;
  for (const cand of candidates.slice(0, MAX_CANDIDATES)) {
    if (confirmed.length >= MAX_MATCHES_PER_RUN * 2) break;
    // Los combinados ya traen el precio de cada tramo (Ryanair real; el resto, en caché).
    if (cand.legs) {
      if (flightOk(cand, alert)) confirmed.push(cand);
      continue;
    }
    try {
      const r = await confirm(cand, {
        maxStops: c.flight.maxStops,
        passengers: c.flight.passengers,
        allowPaid: !quotaHit && paid < CONFIRM_PER_RUN,
      });
      if (r.quotaExhausted) {
        quotaHit = true;
        notes.push(t("liveQuota"));
        continue;
      }
      if (r.skipped) continue;
      if (r.paid) paid++;
      summary.confirmed++;
      if (r.offer && flightOk(r.offer, alert) && timesOk(r.offer, windowByKey.get(`${r.offer.depart}_${r.offer.ret}`), times) && dayTripFits(r.offer, c.dates)) {
        confirmed.push(r.offer);
      }
    } catch (err) {
      notes.push(t("confirmError", { route: `${cand.origin}→${cand.destination}`, error: (err as Error).message }));
    }
  }
  confirmed.sort((a, b) => a.price - b.price);
  await recordFares(confirmed.filter((o) => !o.legs));

  // 3) Alojamiento, trayecto aeropuerto→destino y avisos.
  const fresh: { id: string; change: "new" | "cheaper"; total: number; text: string }[] = [];
  for (const flight of confirmed.slice(0, MAX_MATCHES_PER_RUN)) {
    const window = windowByKey.get(`${flight.depart}_${flight.ret}`)!;
    const place = await destinationPlace(alert, flight);
    const data: MatchData = { window, flight, destinationLabel: place.label };

    if (c.hotel && !dayTrip) {
      try {
        const h = await searchHotels(place, flight.depart, flight.ret, window.nights, c.flight.passengers, c.hotel);
        if (h.quotaExhausted) notes.push(t("hotelQuota"));
        const cityNote = t("cityNotFound", { place: place.label });
        if (h.cityNotFound && !notes.includes(cityNote)) notes.push(cityNote);
        data.hotel = h.offers[0];
      } catch (err) {
        notes.push(t("hotelError", { error: (err as Error).message }));
      }
    }

    const airport = getAirport(flight.destination);
    if (airport && place.lat) {
      const target = data.hotel?.lat
        ? { label: data.hotel.name, lat: data.hotel.lat, lon: data.hotel.lon! }
        : { label: place.label, lat: place.lat, lon: place.lon };
      data.lastMile = await lastMile(airport, target, flight.depart, flight.arriveTime).catch(() => undefined);
      const fastest = Math.min(...(data.lastMile?.options.map((o) => o.minutes) ?? [Infinity]));
      if (c.destination.kind === "place" && data.lastMile?.options.length && fastest > c.maxGroundMinutes) {
        notes.push(t("groundTooLong", { airport: flight.destination, time: f.minutes(fastest) }));
        continue;
      }
    }

    const kind = data.hotel ? "full" : "flight";
    if (kind === "full") summary.fullMatches++;
    summary.flightMatches++;
    const total = flight.price * c.flight.passengers + (data.hotel?.total ?? 0);
    const viaKey = flight.via?.length ? `|via:${flight.via.join("+")}` : "";
    const key = `${alert.id}|${kind}|${flight.origin}|${flight.destination}|${flight.depart}|${flight.ret}${viaKey}`;
    const { id: matchId, change } = await upsertMatch(alert.id, kind, key, total, data);
    bestTotal = Math.min(bestTotal, total);

    const shouldNotify = c.notifyMode === "flight" || kind === "full";
    if (change && shouldNotify) {
      const when = `${f.date(flight.depart)} – ${f.date(flight.ret)}`;
      const hotelTxt = data.hotel ? ` + ${data.hotel.name} ${f.eur(Math.round(data.hotel.total))}` : "";
      const ground = data.lastMile?.options.reduce((a, b) => (b.cost < a.cost ? b : a), data.lastMile.options[0]);
      const groundTxt = ground
        ? ` ${t("fromAirport", { option: ground.label, time: f.minutes(ground.minutes), price: f.eur(Math.round(ground.cost)) })}`
        : "";
      const route = flight.via?.length
        ? t("routeCombo", { route: `${flight.origin}→${flight.via.join("/")}→${flight.destination}` })
        : `${flight.origin}→${flight.destination}`;
      const text = t("offerText", { route, when, price: f.eur(flight.price), hotel: hotelTxt, total: f.eur(Math.round(total)) }) + groundTxt;
      fresh.push({ id: matchId, change, total, text });
    }
  }

  // Un aviso por búsqueda: con detalle si es una sola opción; agrupado si hay varias (sin llenarte el móvil).
  if (fresh.length) {
    const cheapest = Math.round(Math.min(...fresh.map((x) => x.total)));
    const one = fresh.length === 1 ? fresh[0] : null;
    const title = one
      ? t(one.change === "cheaper" ? "titleCheaper" : "titleMatch", { name: c.name })
      : t("titleMany", { n: fresh.length, name: c.name });
    const body = one ? t("bodyOne", { text: one.text }) : t("bodyMany", { price: f.eur(cheapest) });
    const sent = await notifyUser(alert.userId, { title, body, path: one ? `/alerts/${alert.id}#m-${one.id}` : "/", matchId: one?.id });
    if (sent > 0) summary.notified = fresh.length;
  }

  // Alternativa solo por tierra (tren/bus) desde el punto de salida indicado.
  if (c.allowGround && c.groundFrom && c.destination.kind === "place") {
    const opts = await groundOptions(c.groundFrom, c.destination.place, {
      date: windows[0].depart,
      hourUtc: 8,
      country: c.destination.place.country,
      includeTaxi: false,
    }).catch(() => []);
    summary.groundOnlyOptions = opts.sort((a, b) => a.minutes - b.minutes).slice(0, 3);
    summary.groundOnly = summary.groundOnlyOptions[0];
  }

  // Histórico guardado de esta ruta: lo visto en viajes parecidos (mismos meses y noches) en el último año.
  if (dests?.length) {
    const stats = await routeStats(c.origins, dests, {
      months: c.dates.months,
      minNights: dayTrip ? 0 : c.dates.minNights,
      maxNights: dayTrip ? 0 : c.dates.maxNights,
      maxStops: c.flight.maxStops,
    }).catch(() => null);
    if (stats) {
      const best = summary.cheapestForDates ?? summary.cheapestSimilar;
      const share = best !== undefined ? await cheaperThanShare(stats, best, c.origins, dests, c.dates.months) : null;
      summary.routeHistory = { ...stats, ...(share !== null && best !== undefined ? { bestShare: share, best } : {}) };
    }
  }

  // Tendencia del mercado (próximos 12 meses) para decir si tu precio es realista.
  if (dests?.length) {
    const pairs = c.origins.flatMap((o) => dests.filter((d) => d !== o).map((d) => [o, d] as const)).slice(0, 4);
    const trends = await Promise.all(pairs.map(([o, d]) => monthlyTrend(o, d).catch(() => ({}) as Record<string, number>)));
    const months: Record<string, number> = {};
    for (const tr of trends) for (const [m, p] of Object.entries(tr)) months[m] = Math.min(months[m] ?? Infinity, p);
    if (Object.keys(months).length) {
      summary.market = {
        route: `${c.origins.join("/")} → ${pairs.map(([, d]) => d).filter((d, i, a) => a.indexOf(d) === i).join("/")}`,
        months: Object.entries(months)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, price]) => ({ month, price })),
      };
    }
  }

  await pruneMatches(alert.id, Math.max(24, c.checkEveryHours * 4));
  if (flightProviders.screen === "mock") {
    notes.push(t("mockPrices"));
  }
  await saveRun(alert.id, summary);
  await addPricePoint(alert.id, {
    at: summary.at,
    flight: summary.cheapestForDates ?? summary.cheapestSimilar ?? null,
    total: Number.isFinite(bestTotal) ? bestTotal : null,
  });
  return summary;
}

/**
 * Ejecuta las alertas pendientes, las más atrasadas primero. Con budgetMs (en la nube, donde
 * cada llamada tiene un tiempo máximo) para a tiempo y deja el resto para la siguiente llamada.
 */
export async function runDueAlerts(log = console.log, budgetMs = Infinity): Promise<number> {
  const started = Date.now();
  // Una vez al día como mucho, se limpia lo muy antiguo del histórico.
  if (new Date().getUTCHours() === 3) await pruneObservations();
  const alerts = (await dueAlerts()).sort((a, b) => (a.lastRunAt ?? "").localeCompare(b.lastRunAt ?? ""));
  let done = 0;
  for (const a of alerts) {
    if (Date.now() - started > budgetMs) {
      log(`Tiempo agotado: quedan ${alerts.length - done} alertas para la próxima llamada.`);
      break;
    }
    done++;
    try {
      const s = await runAlert(a);
      log(`[${a.config.name}] fechas=${s.windows} candidatos=${s.candidates} confirmados=${s.confirmed} vuelos=${s.flightMatches} completos=${s.fullMatches} avisos=${s.notified}`);
    } catch (err) {
      log(`[${a.config.name}] error: ${(err as Error).message}`);
    }
  }
  return done;
}
