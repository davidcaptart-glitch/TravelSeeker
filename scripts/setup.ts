// Crea .env.local con claves VAPID para las notificaciones push (solo si no existe).
import { existsSync, writeFileSync } from "node:fs";
import webpush from "web-push";

if (existsSync(".env.local")) {
  console.log(".env.local ya existe, no se toca.");
  process.exit(0);
}

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
writeFileSync(
  ".env.local",
  `# Notificaciones push (generadas automáticamente)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
VAPID_SUBJECT=mailto:alertas@travelseeker.local

# Vuelos — cribado barato con precios en caché (gratis registrándote en travelpayouts.com)
TRAVELPAYOUTS_TOKEN=

# Vuelos y hoteles en vivo — SerpApi (250 búsquedas/mes gratis en serpapi.com)
SERPAPI_KEY=
SERPAPI_MONTHLY_LIMIT=250
CONFIRM_PER_RUN=4

# Alojamiento — opcional: encuentra la ciudad en TripAdvisor cuando Wikidata no la tiene
# (Content API, plan gratuito en tripadvisor.com/developers)
TRIPADVISOR_KEY=

# Email opcional, p. ej. smtps://usuario:contraseña@smtp.gmail.com:465
SMTP_URL=
MAIL_FROM=

APP_URL=http://localhost:3000
# Base de datos: SQLite local por defecto. En la nube: URL de Turso + token.
# DATABASE_URL=libsql://...
# DATABASE_AUTH_TOKEN=
`,
);
console.log(".env.local creado con claves VAPID nuevas.");
