import { revalidatePath } from "next/cache";
import { decideMatch } from "@/lib/repo";
import { currentUserId } from "@/lib/session";
import { MATCH_STATUSES, type MatchStatus } from "@/lib/types";

// Lo usan los botones "Guardar" / "Descartar" de la notificación (el service worker no puede llamar a acciones de servidor).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status } = (await request.json().catch(() => ({}))) as { status?: MatchStatus };
  if (!status || !MATCH_STATUSES.includes(status)) return new Response("Estado no válido", { status: 400 });
  const alertId = await decideMatch(id, await currentUserId(), status);
  if (!alertId) return new Response("No encontrada", { status: 404 });
  revalidatePath("/");
  revalidatePath("/saved");
  revalidatePath(`/alerts/${alertId}`);
  return Response.json({ ok: true });
}
