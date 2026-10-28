import { Bell, ChevronDown, Database, Smartphone, UserRound } from "lucide-react";
import { Suspense } from "react";
import Loading from "@/app/loading";
import { LinkDeviceForm } from "@/components/LinkDeviceForm";
import { PushManager } from "@/components/PushManager";
import { SettingsForm } from "@/components/SettingsForm";
import { flightProviders } from "@/lib/providers/flights";
import { hotelProvider } from "@/lib/providers/hotels";
import { usage } from "@/lib/quota";
import { currentUser } from "@/lib/session";

const PROVIDER_TEXT: Record<string, string> = {
  travelpayouts: "Travelpayouts (precios en caché, gratis)",
  serpapi: "SerpApi · Google (en vivo, cupo gratuito)",
  cached: "Precio en caché (sin confirmación en vivo)",
  none: "Sin cribado: todas las fechas van a confirmación",
  mock: "Simulado (modo demostración)",
};

function Section({ icon: Icon, title, hint, children }: { icon: typeof Bell; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="hint mt-0.5">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

async function SettingsContent() {
  const user = await currentUser();
  const serp = await usage("serpapi");
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>

      <Section icon={Bell} title="Notificaciones" hint="Para recibir avisos con la app cerrada. En el móvil, instálala primero (menú ⋮ → Instalar aplicación).">
        <PushManager />
      </Section>

      <Section icon={UserRound} title="Tus datos" hint="Los festivos sirven para encontrar puentes.">
        <SettingsForm email={user.email ?? ""} country={user.holidaysCountry} region={user.holidaysRegion ?? ""} />
      </Section>

      <Section icon={Smartphone} title="Tus alertas en otro dispositivo">
        <LinkDeviceForm userId={user.id} />
      </Section>

      <details className="card group text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-muted">
            <Database className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">Fuentes de datos</span>
            <span className="hint">De dónde salen los precios</span>
          </span>
          <ChevronDown className="h-4 w-4 text-muted transition group-open:rotate-180" />
        </summary>
        <ul className="mt-4 space-y-1.5 text-muted">
          <li>Vuelos de Ryanair: tarifas reales (gratis, sin cupo)</li>
          <li>Cribado del resto de vuelos: {PROVIDER_TEXT[flightProviders.screen]}</li>
          <li>Confirmación del resto (último recurso): {PROVIDER_TEXT[flightProviders.confirm]}</li>
          <li>Alojamiento: Xotelo · precios de Booking, Agoda, Trip.com… (gratis, sin cupo)</li>
          <li>
            Ciudad en TripAdvisor: Wikidata
            {process.env.TRIPADVISOR_KEY ? " + API oficial de TripAdvisor" : " (añade TRIPADVISOR_KEY para cubrir más destinos)"}
          </li>
          <li>Alojamiento donde Xotelo no llega: {PROVIDER_TEXT[hotelProvider]}</li>
          <li>Autocares FlixBus: precio real del día</li>
          <li>Tren, bus y transporte urbano: Transitous (horarios reales, gratis)</li>
          <li>Taxi: distancia real con OSRM × tarifa aproximada del país</li>
          <li>Festivos: Nager.Date</li>
        </ul>
        {serp.limit !== Infinity && (
          <p className="hint mt-3">
            Búsquedas en vivo: {serp.usedMonth}/{serp.limit} este mes · {serp.usedToday}/{serp.todayBudget} hoy
          </p>
        )}
      </details>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SettingsContent />
    </Suspense>
  );
}
