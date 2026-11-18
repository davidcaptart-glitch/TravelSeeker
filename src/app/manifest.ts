import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TravelSeeker — alertas de viaje",
    short_name: "TravelSeeker",
    description: "Alertas de precios. Tu próximo viaje, al mejor precio.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c1120",
    theme_color: "#0c1120",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
