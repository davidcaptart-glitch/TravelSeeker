import type { LucideIcon } from "lucide-react";
import { Ban, BellRing, Bookmark, Moon, Palette, Plane, Radar, RefreshCw, Shuffle, Sparkles } from "lucide-react";

/**
 * Novedades que ve el usuario al abrir la app después de una actualización.
 * CADA PUBLICACIÓN CON CAMBIOS VISIBLES AÑADE UNA ENTRADA ARRIBA DEL TODO (id nuevo = se vuelve a mostrar).
 * Escribir para el usuario, no para programadores: qué puede hacer ahora y por qué le viene bien.
 */
export type Release = {
  id: string;
  date: string;
  title: string;
  items: { icon: LucideIcon; title: string; text: string }[];
};

export const CHANGELOG: Release[] = [
  {
    id: "2026-11-19-combinados",
    date: "2026-11-19",
    title: "Vuelos combinados y más destinos baratos",
    items: [
      {
        icon: Shuffle,
        title: "Vuelos combinados",
        text: "Probamos a enlazar dos vuelos por otra ciudad, por ejemplo Barcelona → Londres → Rovaniemi, y te lo proponemos si sale más barato que el vuelo normal. La ciudad la elegimos nosotros.",
      },
      {
        icon: Moon,
        title: "Con noche de paso si compensa",
        text: "Si el segundo vuelo sale temprano, te proponemos salir la tarde anterior y te avisamos de que dormirás en la ciudad del enlace.",
      },
      {
        icon: Plane,
        title: "Más aerolíneas",
        text: "Además de Ryanair buscamos en Norwegian, easyJet, Vueling, Wizz Air, Finnair, SAS y otras.",
      },
      {
        icon: Ban,
        title: "Excluir países en Sorpréndeme",
        text: "Puedes quitar los países que no te interesen, por ejemplo España si solo quieres salir fuera.",
      },
    ],
  },
  {
    id: "2026-11-18-rediseno",
    date: "2026-11-18",
    title: "Nueva imagen y más control sobre tus ofertas",
    items: [
      {
        icon: Palette,
        title: "Nuevo diseño",
        text: "La app estrena la imagen de TravelSeeker y una navegación más sencilla: Ofertas, Guardados, Nueva, Alertas y Ajustes.",
      },
      {
        icon: Sparkles,
        title: "Ofertas para decidir",
        text: "En la pantalla de inicio tienes todos los viajes que encajan, de todas tus alertas, listos para decidir.",
      },
      {
        icon: Bookmark,
        title: "Guárdalos o descártalos",
        text: "Guarda los que te interesen para más tarde o descarta los que no te vengan bien: no te los volveremos a ofrecer.",
      },
      {
        icon: Radar,
        title: "Siempre buscando",
        text: "Seguimos buscando nuevas opciones sin parar hasta que marques un viaje como reservado.",
      },
      {
        icon: BellRing,
        title: "Avisos con botones",
        text: "Cada viaje que encaja te llega en una notificación, y puedes guardarlo o descartarlo desde la propia notificación.",
      },
      {
        icon: RefreshCw,
        title: "Siempre al día",
        text: "La app se actualiza sola con cada mejora y te cuenta aquí las novedades.",
      },
    ],
  },
];

export const LATEST = CHANGELOG[0];
