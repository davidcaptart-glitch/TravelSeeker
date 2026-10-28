// Copia los usuarios con alertas y sus alertas de la base de datos local (data/travelseeker.db) a Turso.
// No copia resultados, caché ni suscripciones push (estas van ligadas a la dirección local).
// Uso: npm run migrate -- --env-file=<archivo con TURSO_DATABASE_URL y TURSO_AUTH_TOKEN>
import { createClient } from "@libsql/client";

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url || url.startsWith("file:")) throw new Error("Falta TURSO_DATABASE_URL (la base de datos de la nube).");
  const local = createClient({ url: "file:data/travelseeker.db" });
  const cloud = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN });

  // Crea las tablas en la nube si aún no existen (mismo esquema que la app).
  process.env.DATABASE_URL = url;
  process.env.DATABASE_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN;
  const { query } = await import("../src/lib/db");
  await query("SELECT 1");

  const users = await local.execute("SELECT * FROM users WHERE id IN (SELECT DISTINCT user_id FROM alerts)");
  for (const u of users.rows) {
    await cloud.execute({
      sql: "INSERT OR IGNORE INTO users (id, email, holidays_country, holidays_region, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [u.id, u.email, u.holidays_country, u.holidays_region, u.created_at],
    });
  }
  const alerts = await local.execute("SELECT * FROM alerts");
  let copied = 0;
  for (const a of alerts.rows) {
    // last_run_at vacío: la nube las busca en la siguiente pasada del cron.
    const r = await cloud.execute({
      sql: "INSERT OR IGNORE INTO alerts (id, user_id, active, config, last_run_at, last_summary, created_at) VALUES (?, ?, ?, ?, NULL, NULL, ?)",
      args: [a.id, a.user_id, a.active, a.config, a.created_at],
    });
    copied += r.rowsAffected;
  }
  console.log(`Usuarios: ${users.rows.length} · alertas copiadas: ${copied} de ${alerts.rows.length}`);
  for (const u of users.rows) {
    const n = alerts.rows.filter((a) => a.user_id === u.id).length;
    console.log(`  ${u.id}: ${n} alerta(s)`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
