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
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { getLocale, getMoney, getT } from "@/i18n/server";
import { CURRENCY_COOKIE, isCurrency } from "@/lib/currency";
import { alertConfigSchema, MATCH_STATUSES, type MatchStatus } from "@/lib/types";

export type FormState = { error?: string } | undefined;

// Las páginas viven bajo /[lang]: se refrescan todas (en todos los idiomas).
function refreshPages() {
  revalidatePath("/[lang]", "layout");
}

/** Cambia la moneda en la que ves los precios (en este dispositivo y en tus avisos). */
export async function setCurrency(currency: string) {
  if (!isCurrency(currency)) return;
  (await cookies()).set({ name: CURRENCY_COOKIE, value: currency, path: "/", maxAge: 60 * 60 * 24 * 365 * 5, sameSite: "lax" });
  await repo.setUserCurrency(await currentUserId(), currency);
  refreshPages();
}

/** Cambia el idioma de la app (se guarda en este dispositivo y en tu usuario, para los avisos). */
export async function setLanguage(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set({ name: LOCALE_COOKIE, value: locale, path: "/", maxAge: 60 * 60 * 24 * 365 * 5, sameSite: "lax" });
  await repo.setUserLocale(await currentUserId(), locale);
  refreshPages();
}

export async function saveAlert(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await currentUserId();
  const id = formData.get("id")?.toString() || null;
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("config")));
  } catch {
    return { error: (await getT("actions"))("invalidForm") };
  }
  const parsed = alertConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `${issue.path.join(" › ")}: ${issue.message}` };
  }
  await repo.setUserLocale(userId, await getLocale());
  await repo.setUserCurrency(userId, (await getMoney()).currency);
  let alertId = id;
  if (id) {
    if (!(await repo.getAlert(id, userId))) return { error: (await getT("actions"))("alertNotFound") };
    await repo.updateAlertConfig(id, userId, parsed.data);
  } else {
    alertId = await repo.createAlert(userId, parsed.data);
  }
  // Primera búsqueda inmediata para que el usuario vea resultados sin esperar al worker.
  const alert = await repo.getAlert(alertId!, userId);
  if (alert) await runAlert(alert).catch((err) => console.error(err));
  refreshPages();
  redirect(`/alerts/${alertId}`);
}

export async function runNow(id: string) {
  const userId = await currentUserId();
  const alert = await repo.getAlert(id, userId);
  if (!alert) return;
  await runAlert(alert);
  await repo.markMatchesSeen(id);
  refreshPages();
}

export async function decide(matchId: string, status: MatchStatus) {
  const userId = await currentUserId();
  if (!MATCH_STATUSES.includes(status)) return;
  const alertId = await repo.decideMatch(matchId, userId, status);
  if (!alertId) return;
  refreshPages();
}

export async function toggleAlert(id: string, active: boolean) {
  const userId = await currentUserId();
  await repo.setAlertActive(id, userId, active);
  refreshPages();
}

export async function removeAlert(id: string) {
  const userId = await currentUserId();
  await repo.deleteAlert(id, userId);
  refreshPages();
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
  if (!parsed.success) return { error: (await getT("actions"))("settingsInvalid") };
  await repo.updateUser(userId, {
    email: parsed.data.email || null,
    holidaysCountry: parsed.data.holidaysCountry,
    holidaysRegion: parsed.data.holidaysRegion || null,
  });
  refreshPages();
  return {};
}

/**
 * Usar en este dispositivo las alertas de otro (el identificador está en Ajustes del otro dispositivo).
 * Solo se aceptan identificadores con alertas, para no crear usuarios vacíos por error.
 */
export async function linkDevice(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getT("actions");
  const id = String(formData.get("userId") ?? "").trim().toLowerCase();
  if (!z.uuid().safeParse(id).success) return { error: t("linkInvalid") };
  if (id === (await currentUserId())) return { error: t("linkSame") };
  if (!(await repo.userHasAlerts(id))) return { error: t("linkNoAlerts") };
  (await cookies()).set({ name: USER_COOKIE, value: id, ...USER_COOKIE_OPTIONS });
  redirect("/");
}

const pushSchema = z.object({ endpoint: z.url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) });

export async function subscribePush(sub: unknown) {
  const userId = await currentUserId();
  const parsed = pushSchema.safeParse(sub);
  if (!parsed.success) return { ok: false };
  await repo.savePushSubscription(userId, parsed.data);
  await repo.setUserLocale(userId, await getLocale());
  await repo.setUserCurrency(userId, (await getMoney()).currency);
  return { ok: true };
}

export async function unsubscribePush(endpoint: string) {
  await currentUserId();
  await repo.deletePushSubscription(endpoint);
  return { ok: true };
}

export async function sendTestNotification() {
  const userId = await currentUserId();
  const t = await getT("actions");
  const n = await notifyUser(userId, { title: "TravelSeeker", body: t("testBody"), path: "/" });
  return { delivered: n };
}
