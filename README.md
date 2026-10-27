# TravelSeeker

Alertas de viaje que buscan sin parar en **tus** días libres (fines de semana, puentes, festivos y los días que te puedas coger) y te avisan cuando aparece algo que encaja:

- Varias alertas, cada una con sus meses, días, aeropuertos, precio y escalas.
- Aviso **solo con el vuelo** o **solo cuando cumplen vuelo + alojamiento**.
- Destino concreto o **"a cualquier sitio"** filtrando por tipo (playa, ciudad, nieve…) y país.
- Elección de aeropuertos de llegada (p. ej. solo Orly para París).
- Trayecto aeropuerto → centro/alojamiento: transporte público con horarios reales y taxi, con coste aproximado.
- **Rutas alternativas**: aeropuertos más lejanos + tren/bus/urbano (combinadas con taxi si hace falta) y la opción de ir solo por tierra.
- Notificaciones push (PWA instalable en el móvil) y email opcional.

## Puesta en marcha

```bash
npm install
npm run setup     # crea .env.local con las claves de notificaciones
npm run dev       # la web en http://localhost:3000
npm run worker    # en otra terminal: el buscador continuo
```

Sin claves de API ya usa datos reales para los vuelos de **Ryanair**, el **alojamiento** (Xotelo), las rutas por tierra, el taxi y los festivos. Solo el resto de vuelos sale simulado hasta que añadas las claves.

## Fuentes de datos (gratuitas)

| Qué | Fuente | Clave |
| --- | --- | --- |
| Vuelos de Ryanair (precio real, también "a cualquier sitio") | API pública del buscador de Ryanair (no oficial) | no, sin cupo |
| Cribado del resto de vuelos (precios en caché) | Travelpayouts / Aviasales Data API | `TRAVELPAYOUTS_TOKEN` (gratis al darte de alta como afiliado) |
| Confirmación en vivo del resto (último recurso) | SerpApi · Google Flights | `SERPAPI_KEY` (250 búsquedas/mes gratis) |
| Alojamiento (Booking, Agoda, Trip.com…) | Xotelo (precios de TripAdvisor) + código de ciudad de Wikidata | no, sin cupo |
| Alojamiento donde Xotelo no llega | SerpApi · Google Hotels | la misma `SERPAPI_KEY` (comparte cupo) |
| Tren, bus, metro… | Transitous (MOTIS) | no |
| Taxi | OSRM (distancia real) × tarifa aproximada del país | no |
| Lugares y estaciones | Photon (OpenStreetMap) | no |
| Festivos | Nager.Date | no |
| Aeropuertos | OurAirports (`npm run airports` lo regenera) | no |

### El embudo

Las búsquedas en vivo gratuitas son pocas, así que cada alerta funciona como un embudo:

1. **Fechas**: se generan todas las combinaciones ida/vuelta posibles según tus meses y días libres.
2. **Cribado**: precios en caché de Travelpayouts, muchas consultas y sin coste. Pasan los que están hasta un 15 % por encima de tu precio.
3. **Confirmación**: primero con Ryanair (gratis). Solo si el vuelo es de otra aerolínea se gasta una búsqueda de SerpApi, como mucho `CONFIRM_PER_RUN` por ejecución y con un cupo diario repartido para no agotar el mes (`SERPAPI_MONTHLY_LIMIT`).
4. **Alojamiento y trayecto** solo para los vuelos que cumplen (alojamiento con Xotelo; SerpApi solo si la ciudad no está).
5. **Aviso** si el resultado es nuevo o ha bajado al menos un 5 %.

Para usar APIs privadas o de pago (Duffel, Hotelbeds, Booking, Trainline, Omio…) basta con añadir un adaptador en `src/lib/providers/`.

## Estructura

- `src/lib/engine.ts`: el embudo de cada alerta y el worker.
- `src/lib/providers/`: vuelos, hoteles y rutas por tierra (reales + simulados).
- `src/lib/dates.ts`: fines de semana, puentes y días de vacaciones.
- `src/lib/fares.ts`: tarifas aproximadas de taxi y transporte.
- `src/app/`: la web (Next.js 16, App Router) y la API (`/api/cron` para un cron externo con `CRON_SECRET`).
- `scripts/`: `worker`, `setup`, `demo` (crea alertas de ejemplo) y `airports`.

## Despliegue

- La base de datos es SQLite local (`data/`). En la nube, apunta `DATABASE_URL`/`DATABASE_AUTH_TOKEN` a Turso (libSQL, plan gratuito).
- El worker necesita un proceso que esté siempre encendido (Railway, Fly.io, un VPS o tu PC). En plataformas serverless, llama a `GET /api/cron` cada pocos minutos con `Authorization: Bearer $CRON_SECRET`.
- Las notificaciones push requieren HTTPS (en local: `next dev --experimental-https`).

## Limitaciones conocidas

- Los precios de tren, bus y taxi son **estimaciones**. La app enlaza a Trainline, Omio, FlixBus y Google Maps para ver el precio real.
- Para fechas lejanas, los horarios de transporte público se consultan en un día equivalente de las próximas semanas.
- Ryanair y Xotelo son APIs públicas pero no oficiales: si cambian, el embudo sigue con las demás fuentes. Xotelo no da estrellas, así que el filtro de estrellas solo se aplica cuando la fuente las tiene.
- El código de ciudad de TripAdvisor se busca solo en Wikidata. Si un destino no lo tiene, la alerta lo indica y basta con pegar el enlace de la ciudad en TripAdvisor en el apartado Alojamiento.
- Los usuarios son anónimos (una cookie por dispositivo). Para cuentas con inicio de sesión hay que añadir autenticación.
