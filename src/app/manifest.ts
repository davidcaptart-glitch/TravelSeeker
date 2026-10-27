import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TravelSeeker — alertas de viaje",
    short_name: "TravelSeeker",
    description: "Te avisa cuando aparece un viaje que encaja con tus días libres y tu presupuesto.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#0f6e5f",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
