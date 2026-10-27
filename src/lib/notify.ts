import webpush from "web-push";
import nodemailer from "nodemailer";
import { deletePushSubscription, pushSubscriptions } from "./repo";
import { query } from "./db";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:alertas@travelseeker.local", VAPID_PUBLIC, VAPID_PRIVATE);
}

const mailer = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;

export type Notification = { title: string; body: string; path: string };

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
    const [u] = await query<{ email: string | null }>("SELECT email FROM users WHERE id = ?", [userId]);
    if (u?.email) {
      try {
        await mailer.sendMail({
          from: process.env.MAIL_FROM ?? "TravelSeeker <alertas@travelseeker.local>",
          to: u.email,
          subject: n.title,
          text: `${n.body}\n\nVer detalles: ${APP_URL}${n.path}`,
        });
        delivered++;
      } catch (err) {
        console.error("Error enviando email", err);
      }
    }
  }
  return delivered;
}
