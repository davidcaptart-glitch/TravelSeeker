import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TravelSeeker — alertas de viaje",
    short_name: "TravelSeeker",
    description: "Te avisa cuando aparece un viaje que encaja con tus días libres y tu presupuesto.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f1ec",
    theme_color: "#162040",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
