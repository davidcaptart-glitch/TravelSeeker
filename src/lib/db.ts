import { createClient, type Client, type InValue } from "@libsql/client";
import { mkdirSync } from "node:fs";

// SQLite local por defecto; en la nube, Turso (libSQL): DATABASE_URL o las variables
// TURSO_* que crea la integración de Turso en Vercel.
const url = process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL ?? "file:data/travelseeker.db";
const authToken = process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  holidays_country TEXT DEFAULT 'ES',
  holidays_region TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL,
  last_run_at TEXT,
  last_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS alerts_user ON alerts(user_id);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  total_price REAL NOT NULL,
  data TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS matches_alert ON matches(alert_id);
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS price_history (
  alert_id TEXT NOT NULL,
  at TEXT NOT NULL,
  flight REAL,
  total REAL
);
CREATE INDEX IF NOT EXISTS price_history_alert ON price_history (alert_id, at);
CREATE TABLE IF NOT EXISTS api_usage (
  provider TEXT NOT NULL,
  period TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, period)
);
`;

// Columnas añadidas después de crear la base (SQLite no tiene ADD COLUMN IF NOT EXISTS).
async function migrate(c: Client) {
  const cols = await c.execute("PRAGMA table_info(matches)");
  if (!cols.rows.some((r) => r.name === "status")) {
    // new: pendiente de decidir · saved: guardado para más tarde · dismissed: descartado · booked: lo has cogido.
    await c.execute("ALTER TABLE matches ADD COLUMN status TEXT NOT NULL DEFAULT 'new'");
  }
}

let client: Client | null = null;
let ready: Promise<void> | null = null;

function getClient(): Client {
  if (!client) {
    if (url.startsWith("file:")) mkdirSync("data", { recursive: true });
    client = createClient({ url, authToken });
    const c = client;
    ready = c.executeMultiple(SCHEMA).then(() => migrate(c));
  }
  return client;
}

export async function query<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T[]> {
  const c = getClient();
  await ready;
  const res = await c.execute({ sql, args });
  return res.rows.map((r) => ({ ...r }) as T);
}

export async function exec(sql: string, args: InValue[] = []): Promise<number> {
  const c = getClient();
  await ready;
  const res = await c.execute({ sql, args });
  return res.rowsAffected;
}

export async function peekCache<T>(key: string): Promise<T | undefined> {
  const [hit] = await query<{ value: string; expires_at: number }>("SELECT value, expires_at FROM cache WHERE key = ?", [key]);
  return hit && Number(hit.expires_at) > Date.now() ? (JSON.parse(hit.value) as T) : undefined;
}

// Caché genérica clave/valor con caducidad (respuestas de APIs, rutas, festivos...).
export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const [hit] = await query<{ value: string; expires_at: number }>(
    "SELECT value, expires_at FROM cache WHERE key = ?",
    [key],
  );
  if (hit && Number(hit.expires_at) > now) return JSON.parse(hit.value) as T;
  const value = await load();
  await exec(
    "INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at",
    [key, JSON.stringify(value), now + ttlSeconds * 1000],
  );
  return value;
}
