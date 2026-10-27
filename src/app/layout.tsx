import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TravelSeeker",
  description: "Alertas de viaje: vuelos, alojamiento y rutas que encajan con tus días libres.",
  appleWebApp: { capable: true, title: "TravelSeeker", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0f6e5f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
          <nav className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3 text-sm">
            <Link href="/" className="mr-auto flex items-center gap-2 font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-white dark:text-black">✈</span>
              TravelSeeker
            </Link>
            <Link href="/" className="rounded-lg px-3 py-1.5 hover:bg-surface-2">
              Alertas
            </Link>
            <Link href="/settings" className="rounded-lg px-3 py-1.5 hover:bg-surface-2">
              Ajustes
            </Link>
            <Link href="/alerts/new" className="btn-primary ml-1 py-1.5">
              + Nueva
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
        <ServiceWorker />
      </body>
    </html>
  );
}
