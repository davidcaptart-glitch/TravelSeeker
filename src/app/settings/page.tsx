import { Suspense } from "react";
import Loading from "@/app/loading";
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

async function SettingsContent() {
  const user = await currentUser();
  const serp = await usage("serpapi");
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>

      <section className="card space-y-3">
        <h2 className="font-semibold">Notificaciones</h2>
        <p className="hint">Para recibir avisos con la app cerrada. En el móvil, instálala primero (Añadir a pantalla de inicio).</p>
        <PushManager />
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Tus datos</h2>
        <SettingsForm email={user.email ?? ""} country={user.holidaysCountry} region={user.holidaysRegion ?? ""} />
      </section>

      <section className="card space-y-2 text-sm">
        <h2 className="font-semibold">Fuentes de datos</h2>
        <ul className="space-y-1">
          <li>Vuelos de Ryanair: tarifas reales (gratis, sin cupo)</li>
          <li>Cribado del resto de vuelos: {PROVIDER_TEXT[flightProviders.screen]}</li>
          <li>Confirmación del resto (último recurso): {PROVIDER_TEXT[flightProviders.confirm]}</li>
          <li>Alojamiento: Xotelo · precios de Booking, Agoda, Trip.com… (gratis, sin cupo)</li>
          <li>Alojamiento donde Xotelo no llega: {PROVIDER_TEXT[hotelProvider]}</li>
          <li>Tren, bus y transporte urbano: Transitous (horarios reales, gratis)</li>
          <li>Taxi: distancia real con OSRM × tarifa aproximada del país</li>
          <li>Festivos: Nager.Date</li>
        </ul>
        {serp.limit !== Infinity && (
          <p className="hint">
            Búsquedas en vivo: {serp.usedMonth}/{serp.limit} este mes · {serp.usedToday}/{serp.todayBudget} hoy
          </p>
        )}
        <p className="hint">Tu identificador de usuario: {user.id}</p>
      </section>
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
