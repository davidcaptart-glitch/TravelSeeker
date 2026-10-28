import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BottomNav, Logo, TopNav } from "@/components/Nav";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1018" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-md" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Logo />
            <TopNav />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-28 md:pb-12">{children}</main>
        <BottomNav />
        <ServiceWorker />
      </body>
    </html>
  );
}
