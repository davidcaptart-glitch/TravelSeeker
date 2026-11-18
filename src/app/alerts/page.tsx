import { Plus, Radar } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import Loading from "@/app/loading";
import { AlertCard } from "@/components/AlertCard";
import { listAlerts, listMatches } from "@/lib/repo";
import { currentUserId } from "@/lib/session";

async function AlertsContent() {
  const userId = await currentUserId();
  const alerts = await listAlerts(userId);
  const matches = new Map(await Promise.all(alerts.map(async (a) => [a.id, await listMatches(a.id)] as const)));
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight">Tus alertas</h1>
          <p className="mt-1 text-sm text-muted">Lo que estamos vigilando por ti, sin parar.</p>
        </div>
        <Link href="/alerts/new" className="btn-primary hidden md:inline-flex">
          <Plus className="h-4 w-4" /> Nueva
        </Link>
      </div>
      {alerts.length ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {alerts.map((a, i) => (
            <li key={a.id} className="min-w-0">
              <AlertCard a={a} ms={matches.get(a.id) ?? []} index={i} />
            </li>
          ))}
        </ul>
      ) : (
        <section className="card flex flex-col items-center gap-3 py-10 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-cyan">
            <Radar className="h-7 w-7" />
          </span>
          <p className="text-lg font-bold">Sin alertas todavía</p>
          <p className="max-w-sm text-sm text-muted">Crea una con tu destino, tus fechas y tu precio, y empezamos a buscar.</p>
          <Link href="/alerts/new" className="btn-primary mt-2">
            <Plus className="h-4 w-4" /> Crear alerta
          </Link>
        </section>
      )}
    </div>
  );
}

export default function AlertsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AlertsContent />
    </Suspense>
  );
}
