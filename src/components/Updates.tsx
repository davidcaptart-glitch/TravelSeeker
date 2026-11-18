"use client";

import { RefreshCw, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { LATEST } from "@/lib/changelog";

const MY_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "local";
const SEEN_KEY = "ts_seen_release";
const CHECK_EVERY_MS = 3 * 60_000;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {}
}

/**
 * Mantiene la app al día: comprueba la versión publicada al volver a la app y cada pocos minutos,
 * y recarga sola cuando hay una nueva. Si estás rellenando un formulario no recarga: muestra un aviso.
 * Después de actualizar, enseña las novedades (una vez por versión).
 */
function LiveUpdates() {
  const path = usePathname();
  const busyForm = path === "/alerts/new" || path.endsWith("/edit");
  const busyRef = useRef(busyForm);
  useEffect(() => {
    busyRef.current = busyForm;
  }, [busyForm]);
  const [ready, setReady] = useState(false);
  const [news, setNews] = useState(false);

  const check = useCallback(async () => {
    if (MY_VERSION === "local") return;
    try {
      const r = await fetch("/api/version", { cache: "no-store" });
      const { version } = (await r.json()) as { version: string };
      if (!version || version === MY_VERSION) return;
      // El service worker también se renueva (avisos con los últimos botones).
      navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
      if (busyRef.current) setReady(true);
      else window.location.reload();
    } catch {}
  }, []);

  useEffect(() => {
    const onShow = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    const t = setInterval(() => document.visibilityState === "visible" && check(), CHECK_EVERY_MS);
    const first = setTimeout(check, 1500);
    return () => {
      clearTimeout(first);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
      clearInterval(t);
    };
  }, [check]);

  // Al salir del formulario con una versión nueva pendiente, se actualiza.
  useEffect(() => {
    if (ready && !busyForm) window.location.reload();
  }, [ready, busyForm]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia guardada en el navegador
    if (read(SEEN_KEY) !== LATEST.id) setNews(true);
  }, []);

  const close = () => {
    write(SEEN_KEY, LATEST.id);
    setNews(false);
  };

  return (
    <>
      {ready && (
        <div className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-surface-3 p-3 text-sm shadow-2xl" role="status">
          <RefreshCw className="h-4 w-4 shrink-0 text-cyan" />
          <span className="flex-1">Hay una versión nueva. Se aplicará al salir de este formulario.</span>
          <button type="button" className="btn-ghost min-h-9 px-3" onClick={() => window.location.reload()}>
            Ahora
          </button>
        </div>
      )}
      {news && !busyForm && <WhatsNew onClose={close} />}
    </>
  );
}

// La ruta solo se conoce en el navegador.
export function Updates() {
  return (
    <Suspense fallback={null}>
      <LiveUpdates />
    </Suspense>
  );
}

function WhatsNew({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsnew-title"
        className="card-glow animate-rise max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-b-none p-6 sm:rounded-b-3xl"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow-pill">Novedades</p>
            <h2 id="whatsnew-title" className="mt-3 text-xl leading-tight font-extrabold tracking-tight">
              {LATEST.title}
            </h2>
          </div>
          <button type="button" className="-m-1 rounded-full p-2 text-muted hover:bg-surface-2" aria-label="Cerrar" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="mt-5 space-y-4">
          {LATEST.items.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-cyan">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-bold">{title}</span>
                <span className="text-sm text-muted">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-primary mt-6 w-full" onClick={onClose}>
          ¡Entendido!
        </button>
      </section>
    </div>
  );
}
