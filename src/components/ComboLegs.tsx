import { AlertTriangle, ExternalLink, Moon, Shuffle } from "lucide-react";
import type { Translator } from "@/i18n/core";
import type { Format } from "@/i18n/format";
import type { NsMessages } from "@/i18n/messages";
import { getFormat, getT } from "@/i18n/server";
import { getAirport } from "@/lib/geo";
import type { FlightLeg, FlightOffer } from "@/lib/types";

// Nombres en español de las ciudades por donde más se enlaza (la lista de aeropuertos viene en inglés):
// solo se usan en español; en los demás idiomas, la ciudad del aeropuerto tal como viene en los datos.
const CITY_ES: Record<string, string> = {
  BGY: "Bérgamo", MXP: "Milán", LIN: "Milán", STN: "Londres", LTN: "Londres", LGW: "Londres", LHR: "Londres", MAN: "Mánchester",
  BHX: "Birmingham", CRL: "Bruselas (Charleroi)", BRU: "Bruselas", BVA: "París (Beauvais)", ORY: "París", CDG: "París",
  BER: "Berlín", CPH: "Copenhague", OSL: "Oslo", ARN: "Estocolmo", NYO: "Estocolmo", HEL: "Helsinki", FRA: "Fráncfort",
  MUC: "Múnich", VIE: "Viena", WAW: "Varsovia", WMI: "Varsovia", KRK: "Cracovia", BUD: "Budapest", DUB: "Dublín",
  FCO: "Roma", CIA: "Roma", ZRH: "Zúrich", GVA: "Ginebra", LIS: "Lisboa", OPO: "Oporto", MAD: "Madrid", BCN: "Barcelona",
  RIX: "Riga", TLL: "Tallin", VNO: "Vilna", PRG: "Praga", BLQ: "Bolonia", VCE: "Venecia", NAP: "Nápoles", AMS: "Ámsterdam",
  EIN: "Eindhoven", BTS: "Bratislava", MLA: "Malta", ATH: "Atenas", GDN: "Gdansk", EDI: "Edimburgo", RVN: "Rovaniemi",
};
const cityName = (code: string, f: Format) =>
  (f.locale === "es" ? CITY_ES[code] : undefined) ?? getAirport(code)?.city?.split(/[,(]/)[0].trim() ?? code;

type I18n = { t: Translator<NsMessages<"alertDetail">>; f: Format };

// Códigos de aerolínea que llegan de Travelpayouts.
const AIRLINES: Record<string, string> = {
  FR: "Ryanair", U2: "easyJet", W6: "Wizz Air", W9: "Wizz Air", W4: "Wizz Air", VY: "Vueling", IB: "Iberia", UX: "Air Europa",
  D8: "Norwegian", DY: "Norwegian", DH: "Norwegian", AY: "Finnair", SK: "SAS", LH: "Lufthansa", AF: "Air France", KL: "KLM",
  LX: "Swiss", OS: "Austrian", LO: "LOT", TP: "TAP", BA: "British Airways", EI: "Aer Lingus", EW: "Eurowings", LS: "Jet2",
  HV: "Transavia", TO: "Transavia", V7: "Volotea", MW: "Connect Airlines", LW: "Pascan", N7: "Nordic Dynamic", BT: "airBaltic",
};
export const airlineName = (a: string) => a.split(" + ").map((x) => AIRLINES[x] ?? x).join(" + ");

/** Noche en la ciudad del enlace: el siguiente vuelo sale otro día. */
function nightAt(prev: FlightLeg, next: FlightLeg) {
  return next.date > (prev.arriveDate ?? prev.date);
}

function Leg({ l, t, f }: { l: FlightLeg } & I18n) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          <span className="font-mono">{l.from}</span> <span className="inline-block rtl:-scale-x-100">→</span> <span className="font-mono">{l.to}</span>
          <span className="font-normal text-muted"> · {airlineName(l.airline)}</span>
        </p>
        <p className="hint">
          {f.date(l.date)} · {l.departTime}
          {l.arriveTime ? `–${l.arriveTime}${l.estimated ? ` ${t("approx")}` : ""}` : ""}
          {l.stops ? ` · ${t("stopsCount", { n: l.stops })}` : ""} · {f.eur(l.price)}
        </p>
      </div>
      {l.link && (
        <a href={l.link} target="_blank" rel="noreferrer" className="btn-ghost min-h-9 shrink-0 px-3 text-xs">
          {t("book")} <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </li>
  );
}

function Side({ title, legs, t, f }: { title: string; legs: FlightLeg[] } & I18n) {
  return (
    <div>
      <p className="eyebrow mb-1.5">{title}</p>
      <ul className="space-y-1.5">
        {legs.map((l, i) => (
          <div key={`${l.from}${l.to}${l.date}`}>
            {i > 0 && nightAt(legs[i - 1], l) && (
              <p className="my-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-warn">
                <Moon className="h-3.5 w-3.5" /> {t("nightAt", { city: cityName(l.from, f) })}
              </p>
            )}
            <Leg l={l} t={t} f={f} />
          </div>
        ))}
      </ul>
    </div>
  );
}

/** Viaje combinado: cada tramo es un billete propio, con su enlace para reservarlo. */
export async function ComboLegs({ flight }: { flight: FlightOffer }) {
  const [t, f] = await Promise.all([getT("alertDetail"), getFormat()]);
  const legs = flight.legs ?? [];
  // La ida termina en el destino; lo demás es la vuelta.
  const split = legs.findIndex((l) => l.to === flight.destination) + 1;
  return (
    <section className="space-y-3 p-4 sm:px-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-cyan">
          <Shuffle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {t("comboTitle", { cities: f.list((flight.via ?? []).map((c) => cityName(c, f))) })}
          </p>
          <p className="hint">{t("comboLead", { price: f.eur(flight.price), n: legs.length })}</p>
        </div>
      </div>
      <Side title={t("outbound")} legs={legs.slice(0, split)} t={t} f={f} />
      <Side title={t("return")} legs={legs.slice(split)} t={t} f={f} />
      <p className="flex items-start gap-2 rounded-2xl bg-warn-soft px-3 py-2 text-xs text-warn">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("comboWarning")}
        {flight.cached ? ` ${t("comboCached")}` : ""}
      </p>
    </section>
  );
}
