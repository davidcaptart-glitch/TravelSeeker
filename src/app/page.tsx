import { Suspense } from "react";
import Loading from "@/app/loading";
import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { ago, eur, monthLabel, STOPS_LABEL } from "@/lib/format";
import { flightProviders } from "@/lib/providers/flights";
import { usage } from "@/lib/quota";
import { latestMatches, listAlerts, listMatches } from "@/lib/repo";
import { currentUserId } from "@/lib/session";
import type { Alert } from "@/lib/types";

function destinationText(a: Alert) {
  const d = a.config.destination;
  if (d.kind === "place") return d.place.label.split(",")[0];
  return d.themes.length ? `Cualquier sitio · ${d.themes.join(", ")}` : "Cualquier sitio";
}

async function HomeContent() {
  const userId = await currentUserId();
  const alerts = await listAlerts(userId);
  const matchesByAlert = new Map(await Promise.all(alerts.map(async (a) => [a.id, await listMatches(a.id)] as const)));
  const latest = await latestMatches(userId, 6);
  const serp = await usage("serpapi");

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tus alertas de viaje</h1>
          <p className="text-sm text-muted">
            Buscamos sin parar en tus fechas libres y te avisamos en cuanto algo encaja.
          </p>
        </div>
        <div className="text-right text-xs text-muted">
          <div>
            Gratis: <b>ryanair, xotelo</b> · Cribado: <b>{flightProviders.screen}</b> · Confirmación:{" "}
            <b>{flightProviders.confirm}</b>
          </div>
          {flightProviders.confirm === "serpapi" && (
            <div>
              Búsquedas en vivo este mes: {serp.usedMonth}/{serp.limit}
            </div>
          )}
        </div>
      </section>

      {alerts.length === 0 ? (
        <div className="card text-center">
          <p className="mb-1 text-lg font-medium">Aún no tienes alertas</p>
          <p className="mb-4 text-sm text-muted">
            Crea una por destino: París avisando solo con el vuelo, Cracovia con vuelo y hotel, o “a cualquier sitio de playa”.
          </p>
          <Link href="/alerts/new" className="btn-primary">
            Crear mi primera alerta
          </Link>
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2">
          {alerts.map((a) => {
            const ms = matchesByAlert.get(a.id) ?? [];
            const best = ms[0];
            const unseen = ms.filter((m) => !m.seen).length;
            return (
              <Link key={a.id} href={`/alerts/${a.id}`} className="card block transition-shadow hover:shadow-md">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{a.config.name}</h2>
                    <p className="text-sm text-muted">
                      {a.config.origins.join(" / ")} → {destinationText(a)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`badge ${a.active ? "bg-good-soft text-good" : "bg-surface-2 text-muted"}`}>
                      {a.active ? "Buscando" : "Pausada"}
                    </span>
                    {unseen > 0 && <span className="badge bg-accent text-white dark:text-black">{unseen} nuevas</span>}
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
                  <span className="badge bg-surface-2">
                    {a.config.notifyMode === "flight" ? "Avisa con el vuelo" : "Avisa con vuelo + alojamiento"}
                  </span>
                  <span className="badge bg-surface-2">≤ {eur(a.config.flight.maxPrice)}</span>
                  <span className="badge bg-surface-2">{STOPS_LABEL[a.config.flight.maxStops]}</span>
                  <span className="badge bg-surface-2">{a.config.dates.months.map(monthLabel).join(", ")}</span>
                  {a.config.allowGround && <span className="badge bg-surface-2">+ tren/bus</span>}
                </div>
                {best ? (
                  <p className="text-sm">
                    Mejor: <b>{eur(best.totalPrice)}</b> · {formatDate(best.data.window.depart)} – {formatDate(best.data.window.ret)}
                    {best.kind === "full" ? " · con alojamiento" : ""}
                  </p>
                ) : (
                  <p className="text-sm text-muted">Sin resultados todavía.</p>
                )}
                <p className="mt-1 text-xs text-muted">Última búsqueda {ago(a.lastRunAt)}</p>
              </Link>
            );
          })}
        </section>
      )}

      {latest.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Últimos hallazgos</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {latest.map((m) => (
              <li key={m.id}>
                <Link href={`/alerts/${m.alertId}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {m.alertName} · {m.data.flight.origin}→{m.data.flight.destination}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDate(m.data.window.depart)} – {formatDate(m.data.window.ret)} · {ago(m.updatedAt)}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold">{eur(m.totalPrice)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <HomeContent />
    </Suspense>
  );
}
