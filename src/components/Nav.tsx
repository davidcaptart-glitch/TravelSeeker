"use client";

import { Bookmark, Plus, Radar, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const NEW = "/alerts/new";

// Cinco destinos claros: lo que hay que decidir, lo guardado, crear, lo que vigilas y los ajustes.
const TABS = [
  { href: "/", label: "Ofertas", icon: Sparkles, match: (p: string) => p === "/" },
  { href: "/saved", label: "Guardados", icon: Bookmark, match: (p: string) => p.startsWith("/saved") },
  { href: NEW, label: "Nueva", icon: Plus, match: (p: string) => p === NEW },
  {
    href: "/alerts",
    label: "Alertas",
    icon: Radar,
    match: (p: string) => p.startsWith("/alerts") && p !== NEW,
  },
  { href: "/settings", label: "Ajustes", icon: Settings, match: (p: string) => p.startsWith("/settings") },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-[1.15rem] font-extrabold tracking-tight" aria-label="TravelSeeker, inicio">
      {/* eslint-disable-next-line @next/next/no-img-element -- marca pequeña y estática */}
      <img src="/brand-mark.png" alt="" width={36} height={36} className="h-9 w-9" />
      <span>
        Travel<span className="text-gradient">Seeker</span>
      </span>
    </Link>
  );
}

/** Enlaces de la cabecera (pantallas medianas y grandes). */
function TopNavView({ path }: { path: string }) {
  return (
    <nav
      className="hidden items-center gap-1 rounded-full bg-surface/80 p-1 text-sm backdrop-blur-xl md:flex"
      style={{ boxShadow: "inset 0 1px 0 var(--highlight), 0 0 0 1px var(--hairline)" }}
    >
      {TABS.filter((t) => t.href !== NEW).map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.match(path) ? "page" : undefined}
          className="rounded-full px-4 py-2 font-semibold text-muted transition hover:text-foreground aria-[current=page]:bg-surface-3 aria-[current=page]:text-foreground"
        >
          {t.label}
        </Link>
      ))}
      <Link href={NEW} className="btn-primary ml-1 min-h-9">
        <Plus className="h-4 w-4" /> Nueva alerta
      </Link>
    </nav>
  );
}

/** Barra inferior tipo app (móvil), con el botón "Nueva" destacado en el centro. */
function BottomNavView({ path }: { path: string }) {
  return (
    <nav className="fixed inset-x-0 z-30 px-3 md:hidden" style={{ bottom: "calc(0.6rem + env(safe-area-inset-bottom))" }}>
      <ul
        className="mx-auto grid max-w-md grid-cols-5 items-end rounded-[1.75rem] px-1 pt-1.5 pb-2 backdrop-blur-xl"
        style={{
          background: "var(--nav-bg)",
          boxShadow: "inset 0 1px 0 var(--highlight), 0 0 0 1px var(--hairline), 0 18px 40px -14px var(--nav-shadow)",
        }}
      >
        {TABS.map((t) => {
          const on = t.match(path);
          const Icon = t.icon;
          if (t.href === NEW) {
            return (
              <li key={t.href} className="flex justify-center">
                <Link
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className="group flex flex-col items-center gap-1 text-[11px] font-semibold text-foreground"
                >
                  <span
                    className="-mt-7 grid h-14 w-14 place-items-center rounded-full text-white transition group-active:scale-90"
                    style={{
                      background: "var(--grad)",
                      boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.35), 0 0 0 5px var(--background), 0 10px 26px -6px rgb(91 124 255 / 0.9)",
                    }}
                  >
                    <Icon className="h-6 w-6 transition group-hover:rotate-90" strokeWidth={2.6} />
                  </span>
                  {t.label}
                </Link>
              </li>
            );
          }
          return (
            <li key={t.href} className="flex justify-center">
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-1 text-[11px] font-semibold transition active:scale-95 ${on ? "text-foreground" : "text-muted"}`}
              >
                <span className={`grid h-8 w-12 place-items-center rounded-full transition ${on ? "bg-accent-soft text-cyan" : ""}`}>
                  <Icon className="h-[21px] w-[21px]" strokeWidth={on ? 2.2 : undefined} />
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// La ruta actual solo se conoce en el navegador: mientras llega, se pinta la barra sin pestaña activa.
function LiveTopNav() {
  return <TopNavView path={usePathname()} />;
}
function LiveBottomNav() {
  return <BottomNavView path={usePathname()} />;
}

export function TopNav() {
  return (
    <Suspense fallback={<TopNavView path="" />}>
      <LiveTopNav />
    </Suspense>
  );
}

export function BottomNav() {
  return (
    <Suspense fallback={<BottomNavView path="" />}>
      <LiveBottomNav />
    </Suspense>
  );
}
