import { exec, query } from "./db";

// Límites mensuales de las APIs con cupo gratuito. Se pueden subir en .env si pasas a un plan de pago.
export const MONTHLY_LIMITS: Record<string, number> = {
  serpapi: Number(process.env.SERPAPI_MONTHLY_LIMIT ?? 250),
};

function periods(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return { month: day.slice(0, 7), day };
}

async function count(provider: string, period: string): Promise<number> {
  const [r] = await query<{ count: number }>("SELECT count FROM api_usage WHERE provider = ? AND period = ?", [provider, period]);
  return r ? Number(r.count) : 0;
}

export async function usage(provider: string) {
  const { month, day } = periods();
  const limit = MONTHLY_LIMITS[provider] ?? Infinity;
  const usedMonth = await count(provider, month);
  const usedToday = await count(provider, day);
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const daysLeft = daysInMonth - now.getUTCDate() + 1;
  // Reparte lo que queda del mes a partes iguales entre los días restantes.
  const todayBudget = Math.max(1, Math.floor((limit - usedMonth + usedToday) / daysLeft));
  return { limit, usedMonth, usedToday, todayBudget: Math.min(todayBudget, limit - usedMonth + usedToday) };
}

/** Reserva una llamada. Devuelve false si se agotaría el cupo del día o del mes. */
export async function take(provider: string): Promise<boolean> {
  const u = await usage(provider);
  if (u.usedMonth >= u.limit || u.usedToday >= u.todayBudget) return false;
  const { month, day } = periods();
  for (const p of [month, day]) {
    await exec(
      "INSERT INTO api_usage (provider, period, count) VALUES (?, ?, 1) ON CONFLICT(provider, period) DO UPDATE SET count = count + 1",
      [provider, p],
    );
  }
  return true;
}
