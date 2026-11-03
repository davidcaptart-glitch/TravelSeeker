import { AlertTriangle, CheckCircle2, ChevronDown, TrendingDown, XCircle } from "lucide-react";
import { eur, monthLabel } from "@/lib/format";
import type { PricePoint, RunSummary } from "@/lib/types";

type Verdict = { tone: "good" | "warn" | "bad"; title: string; text: string };

const TONE = {
  good: { icon: CheckCircle2, cls: "bg-good-soft text-good" },
  warn: { icon: AlertTriangle, cls: "bg-warn-soft text-warn" },
  bad: { icon: XCircle, cls: "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-danger" },
};

const roundUp = (n: number) => Math.ceil(n / 10) * 10;

/** now: lo más barato ahora en tus fechas exactas o, si no hay, en fechas parecidas. seen: mínimo del mes en el mercado. */
function verdict(
  maxPrice: number,
  now: { price: number; where: string } | undefined,
  seen: { month: string; price: number } | undefined,
): Verdict | null {
  if (!now && !seen) return null;
  if (now && now.price <= maxPrice) {
    return { tone: "good", title: "Tu precio es alcanzable", text: `Ahora mismo hay vuelos por ${eur(now.price)} ${now.where}.` };
  }
  const nowTxt = now ? `Ahora lo más barato ${now.where} es ${eur(now.price)}. ` : "";
  if (seen && seen.price <= maxPrice) {
    return {
      tone: "good",
      title: "Tu precio es posible",
      text: `${nowTxt}En ${monthLabel(seen.month)} se han visto vuelos desde unos ${eur(seen.price)} ida y vuelta, así que puede volver a salir.`,
    };
  }
  const best = Math.min(now?.price ?? Infinity, seen?.price ?? Infinity);
  if (best <= maxPrice * 1.2) {
    return {
      tone: "warn",
      title: "Tu precio está ajustado",
      text: `${nowTxt}Lo más bajo visto en tus meses ronda ${eur(best)}, un ${Math.round((best / maxPrice - 1) * 100)} % por encima de tu máximo. Puede salir con alguna bajada.`,
    };
  }
  return {
    tone: "bad",
    title: "Tu precio es difícil",
    text: `${nowTxt}En tus meses no se ha visto por debajo de ${eur(best)}. Para tener opciones, prueba a subir tu máximo a unos ${eur(roundUp(best))} o a añadir meses más baratos.`,
  };
}

/** Barras de lo más barato por mes (próximos 12), con tus meses resaltados y tu máximo como referencia. */
function MonthBars({ months, selected, maxPrice }: { months: { month: string; price: number }[]; selected: string[]; maxPrice: number }) {
  const top = Math.max(maxPrice, ...months.map((m) => m.price)) * 1.15;
  const cheapest = months.reduce((a, b) => (b.price < a.price ? b : a));
  return (
    <figure>
      <div className="relative h-32" role="img" aria-label="Precio más bajo por mes, ida y vuelta aproximada">
        {/* Tu máximo */}
        <div className="absolute inset-x-0 border-t border-dashed border-foreground/35" style={{ bottom: `${(maxPrice / top) * 100}%` }}>
        </div>
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {months.map((m) => {
            const on = selected.includes(m.month);
            return (
              <div key={m.month} className="group relative flex h-full flex-1 items-end" title={`${monthLabel(m.month)}: desde ${eur(m.price)}`}>
                <div
                  className={`w-full rounded-t-[4px] transition group-hover:opacity-80 ${on ? "bg-accent" : "bg-foreground/15"}`}
                  style={{ height: `${(m.price / top) * 100}%` }}
                />
                {m === cheapest && (
                  <span
                    className="absolute left-1/2 -translate-x-1/2 text-[10px] font-semibold whitespace-nowrap tabular-nums"
                    style={{ bottom: `calc(${(m.price / top) * 100}% + 2px)` }}
                  >
                    {eur(m.price)}
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
            {monthLabel(m.month).slice(0, 3)}
          </span>
        ))}
      </div>
      <figcaption className="hint mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> tus meses
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-foreground/15" /> otros meses
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 border-t border-dashed border-foreground/50" /> tu máximo {eur(maxPrice)}
        </span>
        <span>Ida + vuelta más baratas de cada mes, por persona (aprox.)</span>
      </figcaption>
    </figure>
  );
}

/** Evolución del vuelo más barato en tus fechas, una muestra por búsqueda. */
function HistoryLine({ points, maxPrice }: { points: { at: string; value: number }[]; maxPrice: number }) {
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
  const day = (iso: string) =>
    new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full overflow-visible" role="img" aria-label="Evolución del precio más barato en tus fechas">
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
              <title>{`${day(p.at)}: ${eur(p.value)}`}</title>
            </circle>
            {(i === minI || i === last) && <circle cx={x(i)} cy={y(p.value)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />}
          </g>
        ))}
      </svg>
      <figcaption className="hint mt-1 flex justify-between gap-2">
        <span>{day(points[0].at)}</span>
        <span>
          mínimo {eur(values[minI])} · ahora {eur(values[last])}
        </span>
        <span>{day(points[last].at)}</span>
      </figcaption>
    </figure>
  );
}

export function PriceInsights({
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
  const market = summary?.market?.months ?? [];
  const seen = market
    .filter((m) => selectedMonths.includes(m.month))
    .reduce<{ month: string; price: number } | undefined>((a, b) => (!a || b.price < a.price ? b : a), undefined);
  const now =
    summary?.cheapestForDates !== undefined
      ? { price: summary.cheapestForDates, where: "en tus fechas" }
      : summary?.cheapestSimilar !== undefined
        ? { price: summary.cheapestSimilar, where: "en fechas parecidas (mismos meses y noches)" }
        : undefined;
  const v = verdict(maxPrice, now, seen);
  const points = history.filter((p) => p.flight !== null).map((p) => ({ at: p.at, value: p.flight! }));
  if (!v && !market.length && !points.length) return null;
  const cheapestYear = market.length ? market.reduce((a, b) => (b.price < a.price ? b : a)) : undefined;
  const Icon = v ? TONE[v.tone].icon : TrendingDown;

  return (
    <section className="card space-y-5">
      <div>
        <h2 className="font-semibold">¿Es realista tu precio?</h2>
        <p className="hint">Vuelo ida y vuelta por persona, comparado con tu máximo de {eur(maxPrice)}.</p>
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
            <h3 className="text-sm font-medium">Lo más barato de cada mes</h3>
            {cheapestYear && (
              <span className="hint text-right">
                Mes más barato: <b className="text-foreground capitalize">{monthLabel(cheapestYear.month)}</b> ({eur(cheapestYear.price)})
              </span>
            )}
          </div>
          <MonthBars months={market} selected={selectedMonths} maxPrice={maxPrice} />
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Evolución en tus meses</h3>
        {points.length >= 2 ? (
          <HistoryLine points={points} maxPrice={maxPrice} />
        ) : (
          <p className="rounded-2xl bg-surface-2 px-3 py-2.5 text-sm text-muted">
            El histórico empieza ahora: cada búsqueda guarda el vuelo más barato de tus meses y aquí verás si sube o baja.
            {points.length === 1 ? ` Primera muestra: ${eur(points[0].value)}.` : ""}
          </p>
        )}
      </div>

      {market.length > 0 && (
        <details className="group">
          <summary className="hint flex cursor-pointer list-none items-center gap-1 font-medium">
            Ver los datos <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
          </summary>
          <table className="mt-2 w-full text-sm tabular-nums">
            <tbody className="divide-y divide-border">
              {market.map((m) => (
                <tr key={m.month}>
                  <td className="py-1.5 capitalize">{monthLabel(m.month)}</td>
                  <td className="py-1.5 text-right">desde {eur(m.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint mt-2">Fuente: Travelpayouts (precios encontrados recientemente por otros viajeros en {summary?.market?.route}).</p>
        </details>
      )}
    </section>
  );
}
