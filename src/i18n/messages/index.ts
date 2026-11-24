import type { Locale } from "../config";
import common from "./common";
import layout from "./layout";
import nav from "./nav";
import home from "./home";
import saved from "./saved";
import settings from "./settings";
import offers from "./offers";
import push from "./push";
import alertForm from "./alertForm";
import alerts from "./alerts";
import alertDetail from "./alertDetail";
import transport from "./transport";
import engine from "./engine";
import actions from "./actions";
import places from "./places";
import changelog from "./changelog";
import calendar from "./calendar";

/**
 * Todos los textos de la app, por espacio de nombres. Solo se importa en el servidor:
 * al navegador le llega únicamente el idioma elegido (ver I18nProvider).
 * Para añadir un espacio: crea messages/<nombre>.ts con defineMessages() y añádelo aquí.
 */
export const MESSAGES = {
  common,
  layout,
  nav,
  home,
  saved,
  settings,
  offers,
  push,
  alertForm,
  alerts,
  alertDetail,
  transport,
  engine,
  actions,
  places,
  changelog,
  calendar,
};

export type AllMessages = typeof MESSAGES;
export type Namespace = keyof AllMessages;
export type NsMessages<N extends Namespace> = AllMessages[N]["es"];
// Lo que recibe el navegador: un idioma, todos los espacios.
export type LocaleBundle = { [N in Namespace]: NsMessages<N> };

export function bundleFor(locale: Locale): LocaleBundle {
  return Object.fromEntries(Object.entries(MESSAGES).map(([ns, m]) => [ns, m[locale]])) as LocaleBundle;
}
