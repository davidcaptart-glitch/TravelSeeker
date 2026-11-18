"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAlert } from "@/lib/engine";
import { notifyUser } from "@/lib/notify";
import * as repo from "@/lib/repo";
import { currentUserId } from "@/lib/session";
import { USER_COOKIE, USER_COOKIE_OPTIONS } from "@/lib/identity";
import { alertConfigSchema, MATCH_STATUSES, type MatchStatus } from "@/lib/types";

export type FormState = { error?: string } | undefined;

export async function saveAlert(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await currentUserId();
  const id = formData.get("id")?.toString() || null;
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("config")));
  } catch {
    return { error: "Formulario no válido" };
  }
  const parsed = alertConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `${issue.path.join(" › ")}: ${issue.message}` };
  }
  let alertId = id;
  if (id) {
    if (!(await repo.getAlert(id, userId))) return { error: "Alerta no encontrada" };
    await repo.updateAlertConfig(id, userId, parsed.data);
  } else {
    alertId = await repo.createAlert(userId, parsed.data);
  }
  // Primera búsqueda inmediata para que el usuario vea resultados sin esperar al worker.
  const alert = await repo.getAlert(alertId!, userId);
  if (alert) await runAlert(alert).catch((err) => console.error(err));
  revalidatePath("/");
  redirect(`/alerts/${alertId}`);
}

export async function runNow(id: string) {
  const userId = await currentUserId();
  const alert = await repo.getAlert(id, userId);
  if (!alert) return;
  await runAlert(alert);
  await repo.markMatchesSeen(id);
  revalidatePath(`/alerts/${id}`);
}

export async function decide(matchId: string, status: MatchStatus) {
  const userId = await currentUserId();
  if (!MATCH_STATUSES.includes(status)) return;
  const alertId = await repo.decideMatch(matchId, userId, status);
  if (!alertId) return;
  revalidatePath("/");
  revalidatePath("/saved");
  revalidatePath("/alerts");
  revalidatePath(`/alerts/${alertId}`);
}

export async function toggleAlert(id: string, active: boolean) {
  const userId = await currentUserId();
  await repo.setAlertActive(id, userId, active);
  revalidatePath("/");
  revalidatePath("/alerts");
  revalidatePath(`/alerts/${id}`);
}

export async function removeAlert(id: string) {
  const userId = await currentUserId();
  await repo.deleteAlert(id, userId);
  revalidatePath("/");
  redirect("/");
}

const settingsSchema = z.object({
  email: z.union([z.literal(""), z.email()]),
  holidaysCountry: z.string().regex(/^[A-Z]{2}$/),
  holidaysRegion: z.union([z.literal(""), z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/)]),
});

export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await currentUserId();
  const parsed = settingsSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    holidaysCountry: String(formData.get("holidaysCountry") ?? "ES").toUpperCase(),
    holidaysRegion: String(formData.get("holidaysRegion") ?? "").toUpperCase(),
  });
  if (!parsed.success) return { error: "Revisa el email o el código de región (p. ej. ES-CT)" };
  await repo.updateUser(userId, {
    email: parsed.data.email || null,
    holidaysCountry: parsed.data.holidaysCountry,
    holidaysRegion: parsed.data.holidaysRegion || null,
  });
  revalidatePath("/settings");
  return {};
}

/**
 * Usar en este dispositivo las alertas de otro (el identificador está en Ajustes del otro dispositivo).
 * Solo se aceptan identificadores con alertas, para no crear usuarios vacíos por error.
 */
export async function linkDevice(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("userId") ?? "").trim().toLowerCase();
  if (!z.uuid().safeParse(id).success) return { error: "Ese identificador no es válido." };
  if (id === (await currentUserId())) return { error: "Ya estás usando ese identificador." };
  if (!(await repo.userHasAlerts(id))) return { error: "No hay alertas con ese identificador." };
  (await cookies()).set({ name: USER_COOKIE, value: id, ...USER_COOKIE_OPTIONS });
  redirect("/");
}

const pushSchema = z.object({ endpoint: z.url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) });

export async function subscribePush(sub: unknown) {
  const userId = await currentUserId();
  const parsed = pushSchema.safeParse(sub);
  if (!parsed.success) return { ok: false };
  await repo.savePushSubscription(userId, parsed.data);
  return { ok: true };
}

export async function unsubscribePush(endpoint: string) {
  await currentUserId();
  await repo.deletePushSubscription(endpoint);
  return { ok: true };
}

export async function sendTestNotification() {
  const userId = await currentUserId();
  const n = await notifyUser(userId, { title: "TravelSeeker", body: "Las notificaciones funcionan ✈️", path: "/" });
  return { delivered: n };
}
