import { revalidatePath } from "next/cache";
import { getT } from "@/i18n/server";
import { decideMatch } from "@/lib/repo";
import { currentUserId } from "@/lib/session";
import { MATCH_STATUSES, type MatchStatus } from "@/lib/types";

// Lo usan los botones "Guardar" / "Descartar" de la notificación (el service worker no puede llamar a acciones de servidor).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status } = (await request.json().catch(() => ({}))) as { status?: MatchStatus };
  const t = await getT("actions");
  if (!status || !MATCH_STATUSES.includes(status)) return new Response(t("invalidStatus"), { status: 400 });
  const alertId = await decideMatch(id, await currentUserId(), status);
  if (!alertId) return new Response(t("notFound"), { status: 404 });
  // Las páginas viven bajo /[lang]: se refrescan todas (en todos los idiomas).
  revalidatePath("/[lang]", "layout");
  return Response.json({ ok: true });
}
