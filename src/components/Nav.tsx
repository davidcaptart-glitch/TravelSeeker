"use client";

import { Bell, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const TABS = [
  {
    href: "/",
    label: "Alertas",
    icon: Bell,
    match: (p: string) => p === "/" || (p.startsWith("/alerts/") && p !== "/alerts/new"),
  },
  {
    href: "/alerts/new",
    label: "Nueva",
    icon: Plus,
    match: (p: string) => p === "/alerts/new",
  },
  {
    href: "/settings",
    label: "Ajustes",
    icon: Settings,
    match: (p: string) => p.startsWith("/settings"),
  },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-ink to-ink-2 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M3 17c4-1 7-4 9-8" strokeLinecap="round" />
          <path d="M12 9l2.5-4.5L21 3l-1.5 6.5L15 12" strokeLinejoin="round" />
          <circle cx="5" cy="19" r="1.6" fill="var(--accent)" stroke="none" />
        </svg>
      </span>
      TravelSeeker
    </Link>
  );
}

/** Enlaces de la cabecera (pantallas medianas y grandes). */
function TopNavView({ path }: { path: string }) {
  return (
    <nav
      className="hidden items-center gap-1 rounded-full bg-surface/70 p-1 text-sm backdrop-blur-xl md:flex"
      style={{ boxShadow: "inset 0 1px 0 var(--highlight), 0 0 0 1px var(--hairline)" }}
    >
      {TABS.filter((t) => t.href !== "/alerts/new").map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.match(path) ? "page" : undefined}
          className="rounded-full px-4 py-2 font-medium text-muted transition hover:text-foreground aria-[current=page]:bg-foreground/[0.07] aria-[current=page]:text-foreground"
        >
          {t.label}
        </Link>
      ))}
      <Link href="/alerts/new" className="btn-primary group ml-1 min-h-9">
        Nueva alerta
        <span className="btn-icon h-7 w-7">
          <Plus className="h-4 w-4" />
        </span>
      </Link>
    </nav>
  );
}

/** Barra inferior tipo app (móvil). */
function BottomNavView({ path }: { path: string }) {
  return (
    // Isla flotante de cristal, separada de los bordes de la pantalla.
    <nav className="fixed inset-x-0 z-30 px-4 md:hidden" style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
      <ul
        className="mx-auto grid max-w-sm grid-cols-3 items-center rounded-full bg-surface/75 p-1.5 backdrop-blur-xl"
        style={{ boxShadow: "inset 0 1px 0 var(--highlight), 0 0 0 1px var(--hairline), 0 20px 40px -16px rgb(0 0 0 / 0.35)" }}
      >
        {TABS.map((t) => {
          const on = t.match(path);
          const Icon = t.icon;
          const isNew = t.href === "/alerts/new";
          return (
            <li key={t.href} className="flex justify-center">
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                aria-label={t.label}
                className={`flex h-12 items-center justify-center gap-1.5 rounded-full text-xs font-semibold transition active:scale-95 ${
                  isNew
                    ? "w-full bg-accent text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]"
                    : on
                      ? "w-full bg-foreground/[0.07] text-foreground"
                      : "w-full text-muted"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={isNew ? 2.2 : undefined} />
                {(on || isNew) && <span>{t.label}</span>}
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
