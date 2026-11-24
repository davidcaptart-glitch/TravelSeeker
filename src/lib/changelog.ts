import type { LucideIcon } from "lucide-react";
import {
  Ban,
  BellRing,
  Bookmark,
  CalendarPlus,
  CalendarRange,
  CarTaxiFront,
  Clock,
  Coins,
  Globe2,
  History,
  Languages,
  Moon,
  Palette,
  Plane,
  Radar,
  RefreshCw,
  Shuffle,
  Sparkles,
  Sunrise,
  ThumbsUp,
  Ticket,
  TrainFront,
  BedDouble,
} from "lucide-react";
import type { Translator } from "@/i18n/core";
import type { NsMessages } from "@/i18n/messages";

/**
 * Novedades que ve el usuario al abrir la app después de una actualización.
 * CADA PUBLICACIÓN CON CAMBIOS VISIBLES AÑADE UNA ENTRADA ARRIBA DEL TODO (id nuevo = se vuelve a mostrar).
 * Aquí solo va la estructura (id, fecha e iconos); los textos, en src/i18n/messages/changelog.ts con claves
 * r_<id con _>_title, r_<id>_item1_title, r_<id>_item1_text…
 * Escribir para el usuario, no para programadores: qué puede hacer ahora y por qué le viene bien.
 */
export type Release = {
  id: string;
  date: string;
  title: string;
  items: { icon: LucideIcon; title: string; text: string }[];
};

type ReleaseDef = { id: string; date: string; icons: LucideIcon[] };

const RELEASES: ReleaseDef[] = [
  { id: "2026-11-24-mundo", date: "2026-11-24", icons: [Languages, Globe2, Plane, Sunrise, BedDouble, CalendarPlus, History, Coins] },
  { id: "2026-11-24-transporte", date: "2026-11-24", icons: [ThumbsUp, TrainFront, Ticket, CarTaxiFront] },
  { id: "2026-11-24-dias-y-horas", date: "2026-11-24", icons: [CalendarRange, Clock, Clock] },
  { id: "2026-11-19-combinados", date: "2026-11-19", icons: [Shuffle, Moon, Plane, Ban] },
  { id: "2026-11-18-rediseno", date: "2026-11-18", icons: [Palette, Sparkles, Bookmark, Radar, BellRing, RefreshCw] },
];

type Key = Extract<keyof NsMessages<"changelog">, string>;

function translate(r: ReleaseDef, t: Translator<NsMessages<"changelog">>): Release {
  const p = `r_${r.id.replace(/-/g, "_")}`;
  return {
    id: r.id,
    date: r.date,
    title: t(`${p}_title` as Key),
    items: r.icons.map((icon, i) => ({
      icon,
      title: t(`${p}_item${i + 1}_title` as Key),
      text: t(`${p}_item${i + 1}_text` as Key),
    })),
  };
}

/** Todas las novedades en el idioma de t (la más reciente primero). */
export function changelogIn(t: Translator<NsMessages<"changelog">>): Release[] {
  return RELEASES.map((r) => translate(r, t));
}

/** Id de la última versión con novedades (para saber si ya las has visto). */
export const LATEST_ID = RELEASES[0].id;

/** Las novedades de la última versión en el idioma de t. */
export function latestIn(t: Translator<NsMessages<"changelog">>): Release {
  return translate(RELEASES[0], t);
}
