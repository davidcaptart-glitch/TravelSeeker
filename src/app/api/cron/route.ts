import { runDueAlerts } from "@/lib/engine";

// En Vercel cada llamada puede durar como mucho maxDuration segundos.
export const maxDuration = 300;

// Alternativa al worker para plataformas serverless: un cron externo (GitHub Actions) llama aquí
// cada X minutos. Requiere la cabecera Authorization: Bearer <CRON_SECRET>.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("No autorizado", { status: 401 });
  }
  const lines: string[] = [];
  // Se deja margen para responder antes del límite; lo que no dé tiempo sigue en la próxima llamada.
  const n = await runDueAlerts((m) => lines.push(m), (maxDuration - 60) * 1000);
  return Response.json({ checked: n, log: lines });
}
