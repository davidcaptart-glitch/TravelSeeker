import { isCurrency } from "./currency";
import { isLocale, type Locale } from "@/i18n/config";
import { randomUUID } from "node:crypto";
import { exec, query } from "./db";
import type { Alert, AlertConfig, Match, MatchData, MatchStatus, PricePoint, RunSummary } from "./types";

type AlertRow = {
  id: string;
  user_id: string;
  active: number;
  config: string;
  last_run_at: string | null;
  last_summary: string | null;
};

function toAlert(r: AlertRow): Alert {
  return {
    id: r.id,
    userId: r.user_id,
    active: Boolean(r.active),
    config: JSON.parse(r.config),
    lastRunAt: r.last_run_at,
    lastSummary: r.last_summary ? JSON.parse(r.last_summary) : null,
  };
}

export type User = { id: string; email: string | null; holidaysCountry: string; holidaysRegion: string | null; locale: Locale; currency: string };

/** true si el usuario existe y tiene al menos una alerta (para vincular otro dispositivo). */
export async function userHasAlerts(id: string): Promise<boolean> {
  const [r] = await query<{ n: number }>("SELECT COUNT(*) AS n FROM alerts WHERE user_id = ?", [id]);
  return Number(r?.n ?? 0) > 0;
}

export async function ensureUser(id: string): Promise<User> {
  await exec("INSERT OR IGNORE INTO users (id) VALUES (?)", [id]);
  const [u] = await query<{ id: string; email: string | null; holidays_country: string; holidays_region: string | null; locale: string | null; currency: string | null }>(
    "SELECT id, email, holidays_country, holidays_region, locale, currency FROM users WHERE id = ?",
    [id],
  );
  return {
    id: u.id,
    email: u.email,
    holidaysCountry: u.holidays_country ?? "ES",
    holidaysRegion: u.holidays_region,
    // Los usuarios de antes de los idiomas usaban la app en español.
    locale: isLocale(u.locale) ? u.locale : "es",
    currency: isCurrency(u.currency) ? u.currency : "EUR",
  };
}

/** Guarda la moneda del usuario (para los avisos en segundo plano). */
export async function setUserCurrency(id: string, currency: string) {
  if (!isCurrency(currency)) return;
  await exec("UPDATE users SET currency = ? WHERE id = ? AND (currency IS NULL OR currency <> ?)", [currency, id, currency]);
}

/** Guarda el idioma del usuario (para los avisos que se le envían en segundo plano). */
export async function setUserLocale(id: string, locale: Locale) {
  await exec("UPDATE users SET locale = ? WHERE id = ? AND (locale IS NULL OR locale <> ?)", [locale, id, locale]);
}

export async function updateUser(id: string, data: { email: string | null; holidaysCountry: string; holidaysRegion: string | null }) {
  await exec("UPDATE users SET email = ?, holidays_country = ?, holidays_region = ? WHERE id = ?", [
    data.email,
    data.holidaysCountry,
    data.holidaysRegion,
    id,
  ]);
}

export async function listAlerts(userId: string): Promise<Alert[]> {
  const rows = await query<AlertRow>("SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC", [userId]);
  return rows.map(toAlert);
}

export async function getAlert(id: string, userId?: string): Promise<Alert | null> {
  const rows = userId
    ? await query<AlertRow>("SELECT * FROM alerts WHERE id = ? AND user_id = ?", [id, userId])
    : await query<AlertRow>("SELECT * FROM alerts WHERE id = ?", [id]);
  return rows[0] ? toAlert(rows[0]) : null;
}

export async function createAlert(userId: string, config: AlertConfig): Promise<string> {
  const id = randomUUID();
  await exec("INSERT INTO alerts (id, user_id, config) VALUES (?, ?, ?)", [id, userId, JSON.stringify(config)]);
  return id;
}

export async function updateAlertConfig(id: string, userId: string, config: AlertConfig) {
  // Al cambiar criterios se fuerza una nueva búsqueda en la próxima vuelta del worker.
  const n = await exec("UPDATE alerts SET config = ?, last_run_at = NULL WHERE id = ? AND user_id = ?", [JSON.stringify(config), id, userId]);
  // Los resultados antiguos se buscaron con otros criterios.
  if (n) {
    await exec("DELETE FROM matches WHERE alert_id = ?", [id]);
    await exec("DELETE FROM price_history WHERE alert_id = ?", [id]);
  }
}

export async function setAlertActive(id: string, userId: string, active: boolean) {
  await exec("UPDATE alerts SET active = ? WHERE id = ? AND user_id = ?", [active ? 1 : 0, id, userId]);
}

export async function deleteAlert(id: string, userId: string) {
  const n = await exec("DELETE FROM alerts WHERE id = ? AND user_id = ?", [id, userId]);
  if (n) {
    await exec("DELETE FROM matches WHERE alert_id = ?", [id]);
    await exec("DELETE FROM price_history WHERE alert_id = ?", [id]);
  }
}

export async function saveRun(id: string, summary: RunSummary) {
  await exec("UPDATE alerts SET last_run_at = ?, last_summary = ? WHERE id = ?", [summary.at, JSON.stringify(summary), id]);
}

/** Un punto del histórico por búsqueda: vuelo más barato en tus fechas y mejor resultado que cumple. */
export async function addPricePoint(alertId: string, p: PricePoint) {
  if (p.flight === null && p.total === null) return;
  await exec("INSERT INTO price_history (alert_id, at, flight, total) VALUES (?, ?, ?, ?)", [alertId, p.at, p.flight, p.total]);
}

export async function priceHistory(alertId: string, days = 120): Promise<PricePoint[]> {
  return query<PricePoint>(
    "SELECT at, flight, total FROM price_history WHERE alert_id = ? AND at >= datetime('now', ?) ORDER BY at",
    [alertId, `-${days} days`],
  );
}

export async function dueAlerts(): Promise<Alert[]> {
  const rows = await query<AlertRow>("SELECT * FROM alerts WHERE active = 1");
  const now = Date.now();
  return rows.map(toAlert).filter((a) => {
    if (!a.lastRunAt) return true;
    return now - new Date(a.lastRunAt).getTime() >= a.config.checkEveryHours * 3600_000;
  });
}

type MatchRow = {
  id: string;
  alert_id: string;
  kind: "flight" | "full";
  total_price: number;
  data: string;
  seen: number;
  status: MatchStatus;
  created_at: string;
  updated_at: string;
};

function toMatch(r: MatchRow): Match {
  return {
    id: r.id,
    alertId: r.alert_id,
    kind: r.kind,
    totalPrice: Number(r.total_price),
    data: JSON.parse(r.data),
    seen: Boolean(r.seen),
    status: r.status ?? "new",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Guarda un resultado. change = "new" si es nuevo, "cheaper" si ha bajado al menos un 5 %,
 * o null si ya lo conocíamos o lo has descartado/cogido (para no repetir avisos).
 */
export async function upsertMatch(
  alertId: string,
  kind: "flight" | "full",
  dedupeKey: string,
  totalPrice: number,
  data: MatchData,
): Promise<{ id: string; change: "new" | "cheaper" | null }> {
  const [existing] = await query<{ id: string; total_price: number; status: MatchStatus }>(
    "SELECT id, total_price, status FROM matches WHERE dedupe_key = ?",
    [dedupeKey],
  );
  if (!existing) {
    const id = randomUUID();
    await exec("INSERT INTO matches (id, alert_id, dedupe_key, kind, total_price, data) VALUES (?, ?, ?, ?, ?, ?)", [
      id,
      alertId,
      dedupeKey,
      kind,
      totalPrice,
      JSON.stringify(data),
    ]);
    return { id, change: "new" };
  }
  const old = Number(existing.total_price);
  await exec("UPDATE matches SET total_price = ?, data = ?, updated_at = datetime('now') WHERE id = ?", [
    totalPrice,
    JSON.stringify(data),
    existing.id,
  ]);
  if (existing.status === "dismissed" || existing.status === "booked") return { id: existing.id, change: null };
  if (totalPrice <= old * 0.95) {
    await exec("UPDATE matches SET seen = 0 WHERE id = ?", [existing.id]);
    return { id: existing.id, change: "cheaper" };
  }
  return { id: existing.id, change: null };
}

/** Viajes (origen|destino|ida|vuelta) que ya has descartado o cogido: no se vuelven a ofrecer. */
export async function decidedTrips(alertId: string): Promise<Set<string>> {
  const rows = await query<{ dedupe_key: string }>(
    "SELECT dedupe_key FROM matches WHERE alert_id = ? AND status IN ('dismissed', 'booked')",
    [alertId],
  );
  return new Set(rows.map((r) => r.dedupe_key.split("|").slice(2).join("|")));
}

export type MatchWithAlert = Match & { alertName: string };

async function userMatches(userId: string, where: string, args: (string | number)[], order: string, limit = 60): Promise<MatchWithAlert[]> {
  const rows = await query<MatchRow & { config: string }>(
    `SELECT m.*, a.config FROM matches m JOIN alerts a ON a.id = m.alert_id
     WHERE a.user_id = ? AND ${where} ORDER BY ${order} LIMIT ?`,
    [userId, ...args, limit],
  );
  return rows.map((r) => ({ ...toMatch(r), alertName: (JSON.parse(r.config) as AlertConfig).name }));
}

/** Ofertas pendientes de decidir, de todas tus alertas: lo más reciente primero. */
export function inboxMatches(userId: string) {
  return userMatches(userId, "m.status = 'new'", [], "m.seen ASC, m.updated_at DESC, m.total_price ASC");
}

export function savedMatches(userId: string) {
  return userMatches(userId, "m.status IN ('saved', 'booked')", [], "m.status = 'booked' DESC, json_extract(m.data, '$.window.depart') ASC");
}

export async function getMatch(id: string, userId: string): Promise<Match | null> {
  const [r] = await query<MatchRow>(
    "SELECT m.* FROM matches m JOIN alerts a ON a.id = m.alert_id WHERE m.id = ? AND a.user_id = ?",
    [id, userId],
  );
  return r ? toMatch(r) : null;
}

/**
 * Decide sobre una oferta. Al cogerla, la alerta se pausa (ya tienes viaje); si deshaces, vuelve a buscar.
 * Devuelve el id de la alerta, o null si la oferta no es tuya.
 */
export async function decideMatch(id: string, userId: string, status: MatchStatus): Promise<string | null> {
  const m = await getMatch(id, userId);
  if (!m) return null;
  await exec("UPDATE matches SET status = ?, seen = 1 WHERE id = ?", [status, id]);
  if (status === "booked") {
    // Solo un viaje cogido por alerta.
    await exec("UPDATE matches SET status = 'saved' WHERE alert_id = ? AND status = 'booked' AND id != ?", [m.alertId, id]);
    await setAlertActive(m.alertId, userId, false);
  } else if (m.status === "booked") {
    await setAlertActive(m.alertId, userId, true);
  }
  return m.alertId;
}

export async function listMatches(alertId: string): Promise<Match[]> {
  const rows = await query<MatchRow>(
    "SELECT * FROM matches WHERE alert_id = ? ORDER BY kind = 'full' DESC, total_price ASC",
    [alertId],
  );
  return rows.map(toMatch);
}

// Borra resultados caducados: viajes ya pasados u ofertas que no se han vuelto a ver en varias búsquedas.
// Resultados con precios inventados que quedaran de cuando la app usaba datos simulados.
export async function deleteSimulatedMatches(alertId: string) {
  await exec(
    `DELETE FROM matches WHERE alert_id = ? AND (json_extract(data, '$.flight.provider') IN ('simulado', 'sin-cribado') OR json_extract(data, '$.hotel.provider') = 'simulado')`,
    [alertId],
  );
}

export async function pruneMatches(alertId: string, staleHours: number) {
  const today = new Date().toISOString().slice(0, 10);
  await exec(
    // Los guardados y descartados se conservan hasta la fecha del viaje (para recordarlos y no volver a ofrecerlos).
    `DELETE FROM matches WHERE alert_id = ? AND status != 'booked' AND (json_extract(data, '$.window.depart') <= ? OR (status = 'new' AND updated_at < datetime('now', ?)))`,
    [alertId, today, `-${Math.round(staleHours)} hours`],
  );
}

export async function markMatchesSeen(alertId: string) {
  await exec("UPDATE matches SET seen = 1 WHERE alert_id = ?", [alertId]);
}

export async function savePushSubscription(userId: string, sub: { endpoint: string }) {
  await exec(
    "INSERT INTO push_subscriptions (endpoint, user_id, data) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, data = excluded.data",
    [sub.endpoint, userId, JSON.stringify(sub)],
  );
}

export async function deletePushSubscription(endpoint: string) {
  await exec("DELETE FROM push_subscriptions WHERE endpoint = ?", [endpoint]);
}

export async function pushSubscriptions(userId: string): Promise<{ endpoint: string; data: string }[]> {
  return query("SELECT endpoint, data FROM push_subscriptions WHERE user_id = ?", [userId]);
}
