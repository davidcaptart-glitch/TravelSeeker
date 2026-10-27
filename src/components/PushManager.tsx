"use client";

import { useEffect, useState } from "react";
import { sendTestNotification, subscribePush, unsubscribePush } from "@/app/actions";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function PushManager() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [msg, setMsg] = useState("");
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
    try {
      const reg = await navigator.serviceWorker.ready;
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      await subscribePush(JSON.parse(JSON.stringify(s)));
      setSub(s);
      setMsg("Notificaciones activadas en este dispositivo.");
    } catch {
      setMsg("No se pudo activar. Revisa los permisos de notificación del navegador.");
    }
  }

  async function unsubscribe() {
    if (!sub) return;
    await unsubscribePush(sub.endpoint);
    await sub.unsubscribe();
    setSub(null);
    setMsg("Notificaciones desactivadas.");
  }

  if (supported === null) return null;
  if (!supported) {
    return (
      <p className="hint">
        Este navegador no admite notificaciones push.
        {isIOS ? " En iPhone, añade la app a la pantalla de inicio (Compartir → Añadir a inicio) y vuelve a abrirla desde ahí." : ""}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {sub ? (
          <>
            <button type="button" className="btn-ghost" onClick={unsubscribe}>
              Desactivar en este dispositivo
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={async () => {
                const r = await sendTestNotification();
                setMsg(r.delivered ? "Aviso de prueba enviado." : "No se entregó ningún aviso.");
              }}
            >
              Enviar prueba
            </button>
          </>
        ) : (
          <button type="button" className="btn-primary" onClick={subscribe}>
            Activar notificaciones en este dispositivo
          </button>
        )}
      </div>
      {msg && <p className="hint">{msg}</p>}
    </div>
  );
}
