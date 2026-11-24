import webpush from "web-push";
import nodemailer from "nodemailer";
import { deletePushSubscription, pushSubscriptions } from "./repo";
import { query } from "./db";
import { makeT } from "../i18n/core";
import { isLocale } from "../i18n/config";
import { MESSAGES } from "../i18n/messages";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:alertas@travelseeker.local", VAPID_PUBLIC, VAPID_PRIVATE);
}

const mailer = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;

// matchId: el aviso lleva botones "Guardar" y "Descartar" que actúan sobre esa oferta.
export type Notification = { title: string; body: string; path: string; matchId?: string };

/** Envía el aviso por todos los canales configurados. Devuelve cuántos se entregaron. */
export async function notifyUser(userId: string, n: Notification): Promise<number> {
  let delivered = 0;
  console.log(`[aviso] ${n.title} — ${n.body}`);

  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    for (const sub of await pushSubscriptions(userId)) {
      try {
        await webpush.sendNotification(JSON.parse(sub.data), JSON.stringify({ ...n, url: n.path }));
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: la suscripción ya no existe en el navegador.
        if (status === 404 || status === 410) await deletePushSubscription(sub.endpoint);
        else console.error("Error enviando push", err);
      }
    }
  }

  if (mailer) {
    const [u] = await query<{ email: string | null; locale: string | null }>("SELECT email, locale FROM users WHERE id = ?", [userId]);
    if (u?.email) {
      // El email, en el idioma del usuario (sin petición: puede ir desde el worker).
      const locale = isLocale(u.locale) ? u.locale : "es";
      const t = makeT(locale, MESSAGES.engine[locale], MESSAGES.engine.es);
      try {
        await mailer.sendMail({
          from: process.env.MAIL_FROM ?? "TravelSeeker <alertas@travelseeker.local>",
          to: u.email,
          subject: n.title,
          text: `${n.body}\n\n${t("emailDetails", { url: `${APP_URL}${n.path}` })}`,
        });
        delivered++;
      } catch (err) {
        console.error("Error enviando email", err);
      }
    }
  }
  return delivered;
}
