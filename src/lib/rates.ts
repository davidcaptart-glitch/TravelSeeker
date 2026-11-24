import { cached } from "./db";
import { BASE_CURRENCY } from "./currency";

/**
 * Tipos de cambio del día con base en euros (ExchangeRate-API, gratuito y sin clave, se actualiza a diario).
 * Si falla, se queda en euros (1:1) en vez de enseñar precios mal convertidos.
 */
export async function getRates(): Promise<Record<string, number>> {
  return cached(`fx:${BASE_CURRENCY}:v1`, 12 * 3600, async () => {
    const res = await fetch(`https://open.er-api.com/v6/latest/${BASE_CURRENCY}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Tipos de cambio ${res.status}`);
    const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (json.result !== "success" || !json.rates) throw new Error("Tipos de cambio no disponibles");
    return json.rates;
  }).catch(() => ({ [BASE_CURRENCY]: 1 }));
}

/** Cuántas unidades de `currency` vale 1 €. Si no se conoce la moneda, null (se enseña en euros). */
export async function rateFor(currency: string): Promise<number | null> {
  if (currency === BASE_CURRENCY) return 1;
  const r = (await getRates())[currency];
  return r && r > 0 ? r : null;
}
