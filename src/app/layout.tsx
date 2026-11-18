import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { BottomNav, Logo, TopNav } from "@/components/Nav";
import { ServiceWorker } from "@/components/ServiceWorker";
import { Updates } from "@/components/Updates";
import "./globals.css";

// Geométrica y redonda, como el logotipo.
const brand = Plus_Jakarta_Sans({
  variable: "--font-brand",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TravelSeeker",
  description: "Alertas de precios. Tu próximo viaje, al mejor precio.",
  appleWebApp: { capable: true, title: "TravelSeeker", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0c1120",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${brand.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
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
      </body>
    </html>
  );
}
