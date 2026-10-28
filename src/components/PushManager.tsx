"use client";

import { BellRing, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { sendTestNotification, subscribePush, unsubscribePush } from "@/app/actions";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function usePush() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- detección única de capacidades del navegador
    setSupported(ok);
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches);
    if (ok) navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then(setSub).catch(() => {});
  }, []);

  async function subscribe() {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return setMsg("Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY (ejecuta npm run setup).");
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      await subscribePush(JSON.parse(JSON.stringify(s)));
      setSub(s);
      setMsg("Notificaciones activadas en este dispositivo.");
    } catch {
      setMsg(
        Notification.permission === "denied"
          ? "El navegador tiene bloqueados los avisos de esta web. Permítelos en los ajustes del sitio y vuelve a intentarlo."
          : "No se pudo activar. Revisa los permisos de notificación del navegador.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    if (!sub) return;
    setBusy(true);
    await unsubscribePush(sub.endpoint);
    await sub.unsubscribe();
    setSub(null);
    setBusy(false);
    setMsg("Notificaciones desactivadas.");
  }

  async function test() {
    setBusy(true);
    const r = await sendTestNotification();
    setBusy(false);
    setMsg(r.delivered ? "Aviso de prueba enviado: debería llegarte en unos segundos." : "No se entregó ningún aviso.");
  }

  return { supported, sub, msg, busy, isIOS, subscribe, unsubscribe, test };
}

export function PushManager() {
  const p = usePush();
  if (p.supported === null) return <div className="h-11" />;
  if (!p.supported) {
    return (
      <p className="hint">
        Este navegador no admite notificaciones push.
        {p.isIOS ? " En iPhone, añade la app a la pantalla de inicio (Compartir → Añadir a inicio) y vuelve a abrirla desde ahí." : ""}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {p.sub ? (
        <>
          <p className="flex items-center gap-2 text-sm font-medium text-good">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-good-soft">
              <Check className="h-4 w-4" />
            </span>
            Activadas en este dispositivo
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" disabled={p.busy} onClick={p.test}>
              Enviar aviso de prueba
            </button>
            <button type="button" className="btn-quiet" disabled={p.busy} onClick={p.unsubscribe}>
              Desactivar
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="btn-primary" disabled={p.busy} onClick={p.subscribe}>
          <BellRing className="h-4 w-4" /> Activar notificaciones
        </button>
      )}
      {p.msg && (
        <p className="hint" role="status">
          {p.msg}
        </p>
      )}
    </div>
  );
}

const DISMISS_KEY = "ts_push_banner_dismissed";

/** Invitación en la portada a activar los avisos, solo si aún no están activados en este dispositivo. */
export function PushBanner() {
  const p = usePush();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia guardada en el navegador
    setHidden(dismissed);
  }, []);

  if (hidden || !p.supported || (p.sub && !p.msg)) return null;
  return (
    <div className="card animate-rise flex items-start gap-3 border-accent/30 bg-accent-soft/60 p-4" role="region" aria-label="Notificaciones">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent text-accent-ink">
        <BellRing className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        {p.sub ? (
          <p className="text-sm font-medium">{p.msg}</p>
        ) : (
          <>
            <p className="font-semibold">Activa los avisos</p>
            <p className="text-sm text-muted">Te avisamos en el móvil en cuanto aparezca un viaje que encaje, aunque la app esté cerrada.</p>
            <button type="button" className="btn-primary mt-3 min-h-10" disabled={p.busy} onClick={p.subscribe}>
              {p.busy ? "Activando…" : "Activar"}
            </button>
            {p.msg && <p className="hint mt-2">{p.msg}</p>}
          </>
        )}
      </div>
      <button
        type="button"
        className="-m-1 rounded-full p-1.5 text-muted hover:bg-surface-2"
        aria-label="Cerrar"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {}
          setHidden(true);
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
