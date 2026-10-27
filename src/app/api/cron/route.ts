import { runDueAlerts } from "@/lib/engine";

// Alternativa al worker para plataformas serverless: un cron externo llama aquí cada X minutos.
// Requiere la cabecera Authorization: Bearer <CRON_SECRET>.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("No autorizado", { status: 401 });
  }
  const lines: string[] = [];
  const n = await runDueAlerts((m) => lines.push(m));
  return Response.json({ checked: n, log: lines });
}
