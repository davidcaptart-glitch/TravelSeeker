import { ArrowRight, Bed, Bookmark, Compass, Inbox, Plane } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import Loading from "@/app/loading";
import { OfferCard, StillSearching } from "@/components/OfferCard";
import { PushBanner } from "@/components/PushManager";
import { ago } from "@/lib/format";
import { inboxMatches, listAlerts, savedMatches } from "@/lib/repo";
import { currentUserId } from "@/lib/session";

const IDEAS = [
  { icon: Plane, title: "Un destino concreto", text: "París, avisando en cuanto el vuelo baje de tu precio." },
  { icon: Bed, title: "Vuelo + alojamiento", text: "Cracovia, y solo cuando encaje el paquete completo." },
  { icon: Compass, title: "Sorpréndeme", text: "Cualquier sitio de playa en tus puentes." },
];

function Welcome() {
  return (
    <div className="space-y-6">
      <section className="animate-rise hero overflow-hidden p-6 text-center sm:p-10">
        {/* eslint-disable-next-line @next/next/no-img-element -- marca estática */}
        <img src="/brand-mark.png" alt="" width={112} height={112} className="mx-auto h-28 w-28 drop-shadow-[0_12px_30px_rgb(91_124_255/0.45)]" />
        <h1 className="mt-5 text-[2.1rem] leading-[1.08] font-extrabold tracking-tight text-balance">
          Tu próximo viaje, <span className="text-gradient">al mejor precio</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-white/70">
          Dinos cuándo puedes, adónde y cuánto quieres pagar. Buscamos vuelos, alojamiento y trenes sin parar y te avisamos al móvil con cada opción.
        </p>
        <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-white/55 uppercase">Vuelos · Viajes · Alojamientos</p>
        <Link href="/alerts/new" className="btn-primary group mt-7 min-h-12 pl-6">
          Crear mi primera alerta
          <span className="btn-icon">
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </section>

      <section>
        <p className="eyebrow mb-3">Cómo funciona</p>
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            ["1", "Crea una alerta", "Destino, fechas y precio máximo. En un minuto."],
            ["2", "Te avisamos", "Cada viaje que encaje te llega como notificación."],
            ["3", "Tú decides", "Guárdalo, descártalo o resérvalo. Seguimos buscando hasta que reserves."],
          ].map(([n, t, d]) => (
            <li key={n} className="card flex items-start gap-3 p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-brand text-sm font-extrabold text-white">{n}</span>
              <span>
                <span className="block font-bold">{t}</span>
                <span className="text-sm text-muted">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <p className="eyebrow mb-3">Ideas para empezar</p>
        <ul className="grid gap-3 sm:grid-cols-3">
          {IDEAS.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Link href="/alerts/new" className="card flex h-full items-start gap-3 p-4 transition hover:-translate-y-0.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-cyan">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-bold">{title}</span>
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

async function HomeContent() {
  const userId = await currentUserId();
  const alerts = await listAlerts(userId);
  if (alerts.length === 0) return <Welcome />;

  const [inbox, saved] = await Promise.all([inboxMatches(userId), savedMatches(userId)]);
  const searching = alerts.filter((a) => a.active);
  const lastRun = alerts.map((a) => a.lastRunAt).filter(Boolean).sort().at(-1) ?? null;

  return (
    <div className="space-y-6">
      <section className="animate-rise hero p-5 sm:p-6">
        <p className="text-sm font-semibold text-white/70">Ofertas para ti</p>
        <h1 className="mt-1 text-[1.75rem] leading-tight font-extrabold tracking-tight">
          {inbox.length === 0 ? (
            "Todo revisado"
          ) : (
            <>
              <span className="text-gradient">{inbox.length}</span> {inbox.length === 1 ? "opción por decidir" : "opciones por decidir"}
            </>
          )}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {searching.length > 0 ? (
            <StillSearching
              text={`Buscando en ${searching.length} ${searching.length === 1 ? "alerta" : "alertas"} · última búsqueda ${ago(lastRun)}`}
            />
          ) : (
            <p className="text-sm text-white/60">Ninguna alerta está buscando ahora.</p>
          )}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            ["Por decidir", String(inbox.length), "/"],
            ["Guardadas", String(saved.filter((m) => m.status === "saved").length), "/saved"],
            ["Alertas", String(alerts.length), "/alerts"],
          ].map(([k, v, href]) => (
            <Link key={k} href={href} className="glass-tile px-3 py-2.5 transition hover:bg-white/10">
              <span className="block text-xs text-white/60">{k}</span>
              <span className="text-lg font-extrabold tabular-nums">{v}</span>
            </Link>
          ))}
        </div>
      </section>

      <PushBanner />

      {inbox.length > 0 ? (
        <section className="space-y-3">
          <p className="hint px-1">
            Guarda las que te interesen y descarta las que no te vengan bien. Seguiremos buscando más hasta que reserves una.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {inbox.map((m, i) => (
              <OfferCard key={m.id} m={m} index={i} />
            ))}
          </div>
        </section>
      ) : (
        <section className="card flex flex-col items-center gap-3 py-10 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-cyan">
            <Inbox className="h-7 w-7" />
          </span>
          <p className="text-lg font-bold">No tienes nada pendiente</p>
          <p className="max-w-sm text-sm text-muted">
            {searching.length
              ? "Seguimos buscando y te avisaremos en cuanto aparezca otro viaje que encaje."
              : "Reanuda una alerta o crea una nueva para recibir opciones."}
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {saved.length > 0 && (
              <Link href="/saved" className="btn-ghost">
                <Bookmark className="h-4 w-4" /> Ver guardados ({saved.length})
              </Link>
            )}
            <Link href="/alerts/new" className="btn-primary">
              Nueva alerta
            </Link>
          </div>
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
