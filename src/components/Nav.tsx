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
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-white shadow-sm">
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
    <nav className="hidden items-center gap-1 text-sm md:flex">
      {TABS.filter((t) => t.href !== "/alerts/new").map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.match(path) ? "page" : undefined}
          className="rounded-xl px-3 py-2 font-medium text-muted transition hover:bg-surface-2 hover:text-foreground aria-[current=page]:text-foreground"
        >
          {t.label}
        </Link>
      ))}
      <Link href="/alerts/new" className="btn-primary ml-2 min-h-10">
        <Plus className="h-4 w-4" /> Nueva alerta
      </Link>
    </nav>
  );
}

/** Barra inferior tipo app (móvil). */
function BottomNavView({ path }: { path: string }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {TABS.map((t) => {
          const on = t.match(path);
          const Icon = t.icon;
          const isNew = t.href === "/alerts/new";
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${on ? "text-accent" : "text-muted"}`}
              >
                {isNew ? (
                  <span className="-mt-5 grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-ink shadow-lg ring-4 ring-background">
                    <Icon className="h-6 w-6" strokeWidth={2.5} />
                  </span>
                ) : (
                  <span className={`grid h-8 w-14 place-items-center rounded-full transition ${on ? "bg-accent-soft" : ""}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                )}
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
