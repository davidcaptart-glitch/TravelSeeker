import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { BottomNav, Logo, TopNav } from "@/components/Nav";
import { ServiceWorker } from "@/components/ServiceWorker";
import { Updates } from "@/components/Updates";
import { I18nProvider } from "@/i18n/client";
import { isLocale, LOCALES, RTL_LOCALES } from "@/i18n/config";
import { bundleFor } from "@/i18n/messages";
import { tFor } from "@/i18n/server";
import "../globals.css";

// Geométrica y redonda, como el logotipo. Chino, japonés, coreano, árabe e hindi usan la fuente del sistema.
const brand = Plus_Jakarta_Sans({
  variable: "--font-brand",
  subsets: ["latin", "latin-ext", "cyrillic-ext", "vietnamese"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateStaticParams() {
  return LOCALES.map((l) => ({ lang: l }));
}

export async function generateMetadata(): Promise<Metadata> {
  const l = await lang();
  const t = tFor(isLocale(l) ? l : "en", "layout");
  return {
    title: "TravelSeeker",
    description: t("description"),
    appleWebApp: { capable: true, title: "TravelSeeker", statusBarStyle: "black-translucent" },
    icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = {
  themeColor: "#0c1120",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await lang();
  if (!isLocale(locale)) notFound();
  return (
    <html
      lang={locale}
      dir={RTL_LOCALES.includes(locale) ? "rtl" : "ltr"}
      className={`${brand.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <I18nProvider locale={locale} messages={bundleFor(locale)}>
          <header className="z-20 md:sticky md:top-0 md:bg-background/70 md:backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
              <Logo />
              <TopNav />
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-3 pb-32 md:pt-6 md:pb-16">{children}</main>
          <BottomNav />
          <ServiceWorker />
          <Updates />
        </I18nProvider>
      </body>
    </html>
  );
}
