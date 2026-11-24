import { AlertTriangle, CheckCircle2, ChevronDown, TrendingDown, XCircle } from "lucide-react";
import type { Translator } from "@/i18n/core";
import type { Format } from "@/i18n/format";
import type { NsMessages } from "@/i18n/messages";
import { INTL_TAG } from "@/i18n/config";
import { getFormat, getT } from "@/i18n/server";
import type { PricePoint, RunSummary } from "@/lib/types";

type Verdict = { tone: "good" | "warn" | "bad"; title: string; text: string };

const TONE = {
  good: { icon: CheckCircle2, cls: "bg-good-soft text-good" },
  warn: { icon: AlertTriangle, cls: "bg-warn-soft text-warn" },
  bad: { icon: XCircle, cls: "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-danger" },
};

const roundUp = (n: number) => Math.ceil(n / 10) * 10;

/** Mes abreviado para el eje de las barras ("dic", "Dec", "12月"). */
const shortMonth = (m: string, f: Format) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString(INTL_TAG[f.locale], { month: "short", timeZone: "UTC" }).replace(".", "");

type I18n = { t: Translator<NsMessages<"alertDetail">>; f: Format };
// where: "dates" = en tus fechas exactas; "similar" = en fechas parecidas.
type Now = { price: number; where: "dates" | "similar" };

/** now: lo más barato ahora en tus fechas exactas o, si no hay, en fechas parecidas. seen: mínimo del mes en el mercado. */
function verdict(
  maxPrice: number,
  now: Now | undefined,
  seen: { month: string; price: number } | undefined,
  { t, f }: I18n,
): Verdict | null {
  if (!now && !seen) return null;
  if (now && now.price <= maxPrice) {
    const text = now.where === "dates" ? t("verdictNowDates", { price: f.eur(now.price) }) : t("verdictNowSimilar", { price: f.eur(now.price) });
    return { tone: "good", title: t("verdictReachable"), text };
  }
  // Frase previa con lo más barato de ahora (si lo hay); el resto del texto es otra frase completa.
  const nowTxt = now
    ? `${now.where === "dates" ? t("cheapestNowDates", { price: f.eur(now.price) }) : t("cheapestNowSimilar", { price: f.eur(now.price) })} `
    : "";
  if (seen && seen.price <= maxPrice) {
    return {
      tone: "good",
      title: t("verdictPossible"),
      text: nowTxt + t("verdictPossibleText", { month: f.monthLong(seen.month), price: f.eur(seen.price) }),
    };
  }
  const best = Math.min(now?.price ?? Infinity, seen?.price ?? Infinity);
  if (best <= maxPrice * 1.2) {
    return {
      tone: "warn",
      title: t("verdictTight"),
      text: nowTxt + t("verdictTightText", { price: f.eur(best), pct: Math.round((best / maxPrice - 1) * 100) }),
    };
  }
  return {
    tone: "bad",
    title: t("verdictHard"),
    text: nowTxt + t("verdictHardText", { price: f.eur(best), suggested: f.eur(roundUp(best)) }),
  };
}

/** Barras de lo más barato por mes (próximos 12), con tus meses resaltados y tu máximo como referencia. */
function MonthBars({
  months,
  selected,
  maxPrice,
  t,
  f,
}: { months: { month: string; price: number }[]; selected: string[]; maxPrice: number } & I18n) {
  const top = Math.max(maxPrice, ...months.map((m) => m.price)) * 1.15;
  const cheapest = months.reduce((a, b) => (b.price < a.price ? b : a));
  return (
    <figure>
      <div className="relative h-32" role="img" aria-label={t("monthBarsAria")}>
        {/* Tu máximo */}
        <div className="absolute inset-x-0 border-t border-dashed border-foreground/35" style={{ bottom: `${(maxPrice / top) * 100}%` }}>
        </div>
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {months.map((m) => {
            const on = selected.includes(m.month);
            return (
              <div key={m.month} className="group relative flex h-full flex-1 items-end" title={t("monthFrom", { month: f.month(m.month), price: f.eur(m.price) })}>
                <div
                  className={`w-full rounded-t-[4px] transition group-hover:opacity-80 ${on ? "bg-accent" : "bg-foreground/15"}`}
                  style={{ height: `${(m.price / top) * 100}%` }}
                />
                {m === cheapest && (
                  <span
                    className="absolute start-1/2 -translate-x-1/2 rtl:translate-x-1/2 text-[10px] font-semibold whitespace-nowrap tabular-nums"
                    style={{ bottom: `calc(${(m.price / top) * 100}% + 2px)` }}
                  >
                    {f.eur(m.price)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {months.map((m) => (
          <span
            key={m.month}
            className={`flex-1 text-center text-[10px] capitalize ${selected.includes(m.month) ? "font-semibold text-foreground" : "text-muted"}`}
          >
            {shortMonth(m.month, f)}
          </span>
        ))}
      </div>
      <figcaption className="hint mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> {t("yourMonths")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-foreground/15" /> {t("otherMonths")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 border-t border-dashed border-foreground/50" /> {t("yourMax", { price: f.eur(maxPrice) })}
        </span>
        <span>{t("monthBarsCaption")}</span>
      </figcaption>
    </figure>
  );
}

/** Histórico guardado de la ruta: más barato visto, buen precio (25 % más barato) y lo normal (mediana). */
function RouteHistory({ h, t, f }: { h: NonNullable<RunSummary["routeHistory"]> } & I18n) {
  const cells = [
    { label: t("routeMin"), value: h.min, hint: t("routeMinHint", { date: f.day(h.minDepart) }) },
    { label: t("routeGood"), value: h.p25, hint: t("routeGoodHint") },
    { label: t("routeTypical"), value: h.median, hint: t("routeTypicalHint") },
  ];
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{t("routeHistoryTitle")}</h3>
      <div className="grid grid-cols-3 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="min-w-0 rounded-2xl bg-surface-2 p-2.5">
            <p className="hint truncate">{c.label}</p>
            <p className="font-bold tabular-nums">{f.eur(c.value)}</p>
            <p className="hint truncate text-[11px]">{c.hint}</p>
          </div>
        ))}
      </div>
      {h.bestShare !== undefined && h.best !== undefined && h.bestShare > 0 && <p className="text-sm">{t("routeBestShare", { price: f.eur(h.best), pct: Math.round(h.bestShare * 100) })}</p>}
      <p className="hint">{t("routeHistoryText", { samples: f.num(h.samples), days: h.days, since: f.day(h.since) })}</p>
    </div>
  );
}

/** Evolución del vuelo más barato en tus fechas, una muestra por búsqueda. */
function HistoryLine({ points, maxPrice, t, f }: { points: { at: string; value: number }[]; maxPrice: number } & I18n) {
  const W = 300;
  const H = 90;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values, maxPrice) * 0.92;
  const hi = Math.max(...values, maxPrice) * 1.06;
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * (W - 8) + 4);
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * (H - 8) - 4;
  const minI = values.indexOf(Math.min(...values));
  const last = points.length - 1;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const day = (iso: string) => f.day(new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).toISOString());
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full overflow-visible" role="img" aria-label={t("historyAria")}>
        <line
          x1="0"
          x2={W}
          y1={y(maxPrice)}
          y2={y(maxPrice)}
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeDasharray="4 4"
          className="text-foreground"
        />
        <path
          d={d}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <g key={p.at}>
            <circle cx={x(i)} cy={y(p.value)} r="9" fill="transparent">
              <title>{`${day(p.at)}: ${f.eur(p.value)}`}</title>
            </circle>
            {(i === minI || i === last) && <circle cx={x(i)} cy={y(p.value)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />}
          </g>
        ))}
      </svg>
      <figcaption className="hint mt-1 flex justify-between gap-2">
        <span>{day(points[0].at)}</span>
        <span>{t("historyMinNow", { min: f.eur(values[minI]), now: f.eur(values[last]) })}</span>
        <span>{day(points[last].at)}</span>
      </figcaption>
    </figure>
  );
}

export async function PriceInsights({
  summary,
  history,
  selectedMonths,
  maxPrice,
}: {
  summary: RunSummary | null;
  history: PricePoint[];
  selectedMonths: string[];
  maxPrice: number;
}) {
  const [t, f] = await Promise.all([getT("alertDetail"), getFormat()]);
  const market = summary?.market?.months ?? [];
  const seen = market
    .filter((m) => selectedMonths.includes(m.month))
    .reduce<{ month: string; price: number } | undefined>((a, b) => (!a || b.price < a.price ? b : a), undefined);
  const now: Now | undefined =
    summary?.cheapestForDates !== undefined
      ? { price: summary.cheapestForDates, where: "dates" }
      : summary?.cheapestSimilar !== undefined
        ? { price: summary.cheapestSimilar, where: "similar" }
        : undefined;
  const v = verdict(maxPrice, now, seen, { t, f });
  const points = history.filter((p) => p.flight !== null).map((p) => ({ at: p.at, value: p.flight! }));
  const routeHistory = summary?.routeHistory;
  if (!v && !market.length && !points.length && !routeHistory) return null;
  const cheapestYear = market.length ? market.reduce((a, b) => (b.price < a.price ? b : a)) : undefined;
  const Icon = v ? TONE[v.tone].icon : TrendingDown;

  return (
    <section className="card space-y-5">
      <div>
        <h2 className="font-semibold">{t("insightsTitle")}</h2>
        <p className="hint">{t("insightsLead", { price: f.eur(maxPrice) })}</p>
      </div>

      {v && (
        <div className={`flex items-start gap-3 rounded-2xl p-3.5 ${TONE[v.tone].cls}`} role="status">
          <Icon className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">{v.title}</p>
            <p className="text-sm text-foreground/80">{v.text}</p>
          </div>
        </div>
      )}

      {market.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">{t("cheapestPerMonth")}</h3>
            {cheapestYear && (
              <span className="hint text-end">
                {t("cheapestMonth")} <b className="text-foreground capitalize">{f.month(cheapestYear.month)}</b> ({f.eur(cheapestYear.price)})
              </span>
            )}
          </div>
          <MonthBars months={market} selected={selectedMonths} maxPrice={maxPrice} t={t} f={f} />
        </div>
      )}

      {routeHistory && <RouteHistory h={routeHistory} t={t} f={f} />}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">{t("historyTitle")}</h3>
        {points.length >= 2 ? (
          <HistoryLine points={points} maxPrice={maxPrice} t={t} f={f} />
        ) : (
          <p className="rounded-2xl bg-surface-2 px-3 py-2.5 text-sm text-muted">
            {t("historyEmpty")}
            {points.length === 1 ? ` ${t("historyFirst", { price: f.eur(points[0].value) })}` : ""}
          </p>
        )}
      </div>

      {market.length > 0 && (
        <details className="group">
          <summary className="hint flex cursor-pointer list-none items-center gap-1 font-medium">
            {t("viewData")} <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
          </summary>
          <table className="mt-2 w-full text-sm tabular-nums">
            <tbody className="divide-y divide-border">
              {market.map((m) => (
                <tr key={m.month}>
                  <td className="py-1.5 capitalize">{f.monthLong(m.month)}</td>
                  <td className="py-1.5 text-end">{t("fromPrice", { price: f.eur(m.price) })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint mt-2">{t("dataSource", { route: summary?.market?.route ?? "" })}</p>
        </details>
      )}
    </section>
  );
}
