import { ArrowRight, Bed, Bus, Compass, MapPin, Plane, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import Loading from "@/app/loading";
import { PushBanner } from "@/components/PushManager";
import { formatDate } from "@/lib/dates";
import { ago, eur, monthLabel } from "@/lib/format";
import { latestMatches, listAlerts, listMatches } from "@/lib/repo";
import { currentUserId } from "@/lib/session";
import type { Alert } from "@/lib/types";

function destinationText(a: Alert) {
  const d = a.config.destination;
  if (d.kind === "place") return d.place.label.split(",")[0];
  return d.themes.length ? `Cualquier sitio · ${d.themes.join(", ")}` : "Cualquier sitio";
}

const IDEAS = [
  { icon: Plane, title: "Un destino concreto", text: "París solo avisando con el vuelo barato." },
  { icon: Bed, title: "Vuelo + alojamiento", text: "Cracovia, y que te avise solo con el paquete completo." },
  { icon: Compass, title: "Sorpréndeme", text: "Cualquier sitio de playa en tus puentes." },
];

async function HomeContent() {
  const userId = await currentUserId();
  const alerts = await listAlerts(userId);
  const matchesByAlert = new Map(await Promise.all(alerts.map(async (a) => [a.id, await listMatches(a.id)] as const)));
  const latest = await latestMatches(userId, 6);

  const active = alerts.filter((a) => a.active).length;
  const unseen = [...matchesByAlert.values()].flat().filter((m) => !m.seen).length;
  const prices = [...matchesByAlert.values()].flat().map((m) => m.totalPrice);
  const cheapest = prices.length ? Math.min(...prices) : null;

  if (alerts.length === 0) {
    return (
      <div className="space-y-6">
        <section className="animate-rise overflow-hidden rounded-3xl bg-gradient-to-br from-ink to-ink-2 p-6 text-white sm:p-8">
          <span className="badge bg-white/15 text-white">
            <Sparkles className="h-3.5 w-3.5" /> Gratis y sin parar
          </span>
          <h1 className="mt-4 max-w-md text-3xl font-semibold tracking-tight text-balance">Viaja en tus días libres por lo que quieres pagar</h1>
          <p className="mt-2 max-w-md text-white/75">
            Dinos cuándo puedes, adónde y tu presupuesto. Buscamos vuelos, alojamiento y trenes por ti y te avisamos al móvil.
          </p>
          <Link href="/alerts/new" className="btn-primary mt-6">
            <Plus className="h-4 w-4" /> Crear mi primera alerta
          </Link>
        </section>
        <section>
          <p className="eyebrow mb-3">Ideas para empezar</p>
          <ul className="grid gap-3 sm:grid-cols-3">
            {IDEAS.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <Link href="/alerts/new" className="card flex h-full items-start gap-3 p-4 transition hover:-translate-y-0.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="text-sm text-muted">{text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <PushBanner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="animate-rise rounded-3xl bg-gradient-to-br from-ink to-ink-2 p-5 text-white sm:p-6">
        <p className="text-sm text-white/70">Vigilando tus días libres</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
          {unseen > 0 ? `${unseen} ${unseen === 1 ? "novedad" : "novedades"} para ti` : "Tus alertas de viaje"}
        </h1>
        <dl className="mt-5 grid grid-cols-3 gap-2">
          {[
            ["Activas", String(active)],
            ["Novedades", String(unseen)],
            ["Desde", cheapest === null ? "—" : eur(cheapest)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-white/10 px-3 py-2.5">
              <dt className="text-xs text-white/65">{k}</dt>
              <dd className="text-lg font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <PushBanner />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Alertas</h2>
          <Link href="/alerts/new" className="btn-quiet min-h-9 md:hidden">
            <Plus className="h-4 w-4" /> Nueva
          </Link>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {alerts.map((a) => {
            const ms = matchesByAlert.get(a.id) ?? [];
            const best = ms.length ? Math.min(...ms.map((m) => m.totalPrice)) : null;
            const fresh = ms.filter((m) => !m.seen).length;
            const c = a.config;
            return (
              <li key={a.id}>
                <Link href={`/alerts/${a.id}`} className="card group flex h-full flex-col gap-4 p-4 transition hover:-translate-y-0.5 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-xs font-medium text-muted">
                        <span className={`h-2 w-2 rounded-full ${a.active ? "bg-good" : "bg-muted/50"}`} />
                        {a.active ? "Buscando" : "Pausada"}
                        {fresh > 0 && <span className="badge bg-accent text-accent-ink">{fresh} nuevas</span>}
                      </p>
                      <h3 className="mt-1 truncate text-lg font-semibold">{c.name}</h3>
                    </div>
                    <div className="shrink-0 text-right">
                      {best !== null ? (
                        <>
                          <p className="text-xs text-muted">desde</p>
                          <p className="text-xl font-semibold text-accent tabular-nums">{eur(best)}</p>
                        </>
                      ) : (
                        <p className="pt-1 text-xs text-muted">Sin resultados aún</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono font-medium">{c.origins.join(" · ")}</span>
                    <span className="h-px flex-1 border-t border-dashed border-border" />
                    <Plane className="h-4 w-4 text-muted" />
                    <span className="h-px flex-1 border-t border-dashed border-border" />
                    <span className="flex min-w-0 items-center gap-1 font-medium">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <span className="truncate">{destinationText(a)}</span>
                    </span>
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span className="badge bg-surface-2">≤ {eur(c.flight.maxPrice)}</span>
                    <span className="badge bg-surface-2 capitalize">{c.dates.months.map(monthLabel).join(", ")}</span>
                    {c.hotel && (
                      <span className="badge bg-surface-2">
                        <Bed className="h-3 w-3" /> alojamiento
                      </span>
                    )}
                    {c.allowGround && (
                      <span className="badge bg-surface-2">
                        <Bus className="h-3 w-3" /> tren/bus
                      </span>
                    )}
                    <span className="ml-auto">{ago(a.lastRunAt)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {latest.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Últimos hallazgos</h2>
          <ul className="card divide-y divide-border overflow-hidden p-0">
            {latest.map((m) => (
              <li key={m.id}>
                <Link href={`/alerts/${m.alertId}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-muted">
                    {m.kind === "full" ? <Bed className="h-4 w-4" /> : <Plane className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.alertName} · {m.data.flight.origin}→{m.data.flight.destination}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDate(m.data.window.depart)} – {formatDate(m.data.window.ret)} · {ago(m.updatedAt)}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{eur(m.totalPrice)}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
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
