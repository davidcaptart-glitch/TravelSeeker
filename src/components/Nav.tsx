"use client";

import { Bookmark, Plus, Radar, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { LanguagePicker } from "@/components/LanguagePicker";
import { useT } from "@/i18n/client";

const NEW = "/alerts/new";

// Cinco destinos claros: lo que hay que decidir, lo guardado, crear, lo que vigilas y los ajustes.
const TABS = [
  { href: "/", label: "offers", icon: Sparkles, match: (p: string) => p === "/" },
  { href: "/saved", label: "saved", icon: Bookmark, match: (p: string) => p.startsWith("/saved") },
  { href: NEW, label: "new", icon: Plus, match: (p: string) => p === NEW },
  {
    href: "/alerts",
    label: "alerts",
    icon: Radar,
    match: (p: string) => p.startsWith("/alerts") && p !== NEW,
  },
  { href: "/settings", label: "settings", icon: Settings, match: (p: string) => p.startsWith("/settings") },
] as const;

export function Logo() {
  const t = useT("nav");
  return (
    <Link href="/" className="flex items-center gap-2 text-[1.15rem] font-extrabold tracking-tight" aria-label={t("home")}>
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
  const t = useT("nav");
  return (
    <nav
      className="hidden items-center gap-1 rounded-full bg-surface/80 p-1 text-sm backdrop-blur-xl md:flex"
      style={{ boxShadow: "inset 0 1px 0 var(--highlight), 0 0 0 1px var(--hairline)" }}
    >
      {TABS.filter((tab) => tab.href !== NEW).map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.match(path) ? "page" : undefined}
          className="rounded-full px-4 py-2 font-semibold text-muted transition hover:text-foreground aria-[current=page]:bg-surface-3 aria-[current=page]:text-foreground"
        >
          {t(tab.label)}
        </Link>
      ))}
      <Link href={NEW} className="btn-primary ms-1 min-h-9">
        <Plus className="h-4 w-4" /> {t("newAlert")}
      </Link>
    </nav>
  );
}

/** Barra inferior tipo app (móvil), con el botón "Nueva" destacado en el centro. */
function BottomNavView({ path }: { path: string }) {
  const tr = useT("nav");
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
                  {tr(t.label)}
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
                {tr(t.label)}
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

/** Cabecera: enlaces (pantallas medianas y grandes) y selector de idioma compacto (siempre visible). */
export function TopNav() {
  return (
    <div className="flex items-center gap-2">
      <Suspense fallback={<TopNavView path="" />}>
        <LiveTopNav />
      </Suspense>
      <LanguagePicker compact />
    </div>
  );
}

export function BottomNav() {
  return (
    <Suspense fallback={<BottomNavView path="" />}>
      <LiveBottomNav />
    </Suspense>
  );
}
