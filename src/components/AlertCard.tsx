import { Bed, Bus, MapPin, PartyPopper, Plane } from "lucide-react";
import Link from "next/link";
import type { Translator } from "@/i18n/core";
import type { NsMessages } from "@/i18n/messages";
import { getFormat, getT } from "@/i18n/server";
import type { Alert, Match } from "@/lib/types";

type AlertsT = Translator<NsMessages<"alerts">>;

export function destinationText(a: Alert, t: AlertsT) {
  const d = a.config.destination;
  if (d.kind === "place") return d.place.label.split(",")[0];
  return d.themes.length ? t("anywhereThemes", { themes: d.themes.map((th) => t(`theme_${th}`)).join(", ") }) : t("anywhere");
}

/** Estado de una alerta en palabras: buscando, pausada o con el viaje ya reservado. */
export function alertState(a: Alert, ms: Match[], t: AlertsT) {
  if (ms.some((m) => m.status === "booked")) return { label: t("stateBooked"), tone: "good" as const };
  if (!a.active) return { label: t("statePaused"), tone: "off" as const };
  return { label: t("stateSearching"), tone: "on" as const };
}

export async function AlertCard({ a, ms, index = 0 }: { a: Alert; ms: Match[]; index?: number }) {
  const [t, f] = await Promise.all([getT("alerts"), getFormat()]);
  const c = a.config;
  const open = ms.filter((m) => m.status === "new" || m.status === "saved");
  const best = open.length ? Math.min(...open.map((m) => m.totalPrice)) : null;
  const pending = ms.filter((m) => m.status === "new").length;
  const saved = ms.filter((m) => m.status === "saved").length;
  const st = alertState(a, ms, t);
  return (
    <Link
      href={`/alerts/${a.id}`}
      className="card animate-rise flex h-full min-w-0 flex-col gap-4 p-4 transition hover:-translate-y-0.5 sm:p-5"
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold text-muted">
            {st.tone === "on" ? (
              <span className="radar relative inline-block h-2 w-2 rounded-full bg-cyan text-cyan" />
            ) : st.tone === "good" ? (
              <PartyPopper className="h-3.5 w-3.5 text-good" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-muted/50" />
            )}
            <span className={st.tone === "good" ? "text-good" : ""}>{st.label}</span>
            <span aria-hidden>·</span>
            <span>{f.ago(a.lastRunAt)}</span>
          </p>
          <h3 className="mt-1 truncate text-lg font-bold">{c.name}</h3>
        </div>
        <div className="shrink-0 text-end">
          {best !== null ? (
            <>
              <p className="hint">{t("from")}</p>
              <p className="text-gradient text-xl font-extrabold tabular-nums">{f.eur(best)}</p>
            </>
          ) : (
            <p className="hint pt-1">{a.active ? t("nothingYet") : "—"}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono font-semibold">{c.origins.join(" · ")}</span>
        <span className="h-px flex-1 bg-gradient-to-r from-cyan/50 to-magenta/50" />
        <Plane className="h-4 w-4 text-cyan rtl:-scale-x-100" />
        <span className="h-px flex-1 bg-gradient-to-r from-cyan/50 to-magenta/50" />
        <span className="flex min-w-0 items-center gap-1 font-semibold">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-magenta" />
          <span className="truncate">{destinationText(a, t)}</span>
        </span>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {pending > 0 && <span className="badge bg-gradient-brand text-white">{t("pendingCount", { n: pending })}</span>}
        {saved > 0 && <span className="badge bg-accent-soft text-accent">{t("savedCount", { n: saved })}</span>}
        <span className="badge bg-surface-2">≤ {f.eur(c.flight.maxPrice)}</span>
        <span className="badge bg-surface-2 capitalize">{f.datesLabel(c.dates)}</span>
        {c.hotel && (
          <span className="badge bg-surface-2">
            <Bed className="h-3 w-3" /> {t("hotel")}
          </span>
        )}
        {c.allowGround && (
          <span className="badge bg-surface-2">
            <Bus className="h-3 w-3" /> {t("ground")}
          </span>
        )}
      </div>
    </Link>
  );
}
