import { CurrencyPicker } from "@/components/CurrencyPicker";
import { observationCounts } from "@/lib/observations";
import { Bell, ChevronDown, Database, Languages, Megaphone, Smartphone, UserRound, Coins, History } from "lucide-react";
import { Suspense } from "react";
import Loading from "@/app/[lang]/loading";
import { LanguagePicker } from "@/components/LanguagePicker";
import { LinkDeviceForm } from "@/components/LinkDeviceForm";
import { PushManager } from "@/components/PushManager";
import { SettingsForm } from "@/components/SettingsForm";
import { flightProviders } from "@/lib/providers/flights";
import { hotelProvider } from "@/lib/providers/hotels";
import { usage } from "@/lib/quota";
import { INTL_TAG } from "@/i18n/config";
import { getFormat, getT } from "@/i18n/server";
import { changelogIn } from "@/lib/changelog";
import { currentUser } from "@/lib/session";

// Proveedores con texto propio en "settings" (provider_<id>).
const PROVIDERS = ["travelpayouts", "serpapi", "cached", "none", "mock", "ryanair"] as const;
type ProviderId = (typeof PROVIDERS)[number];
const isProvider = (p: string): p is ProviderId => (PROVIDERS as readonly string[]).includes(p);

function Section({ icon: Icon, title, hint, children }: { icon: typeof Bell; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-cyan">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="hint mt-0.5">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

async function SettingsContent() {
  const user = await currentUser();
  const [serp, obs] = await Promise.all([usage("serpapi"), observationCounts()]);
  const [t, f, tc] = await Promise.all([getT("settings"), getFormat(), getT("changelog")]);
  const providerText = (p: string) => (isProvider(p) ? t(`provider_${p}`) : p);
  const releases = changelogIn(tc);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("lead")}</p>
      </div>

      <Section icon={Languages} title={t("languageTitle")} hint={t("languageHint")}>
        <LanguagePicker />
      </Section>

      <Section icon={Coins} title={t("currencyTitle")} hint={t("currencyHint")}>
        <CurrencyPicker value={f.currency} />
        {f.currency !== "EUR" && <p className="hint">{t("currencyRate", { rate: f.eur(1) })}</p>}
      </Section>

      <Section icon={Bell} title={t("notifTitle")} hint={t("notifHint")}>
        <PushManager />
      </Section>

      <Section icon={UserRound} title={t("dataTitle")} hint={t("dataHint")}>
        <SettingsForm email={user.email ?? ""} country={user.holidaysCountry} region={user.holidaysRegion ?? ""} />
      </Section>

      <Section icon={Smartphone} title={t("deviceTitle")}>
        <LinkDeviceForm userId={user.id} />
      </Section>

      <Section icon={Megaphone} title={t("changelogTitle")} hint={t("changelogHint")}>
        <ol className="space-y-4">
          {releases.map((r, i) => (
            <li key={r.id} className={i ? "border-t border-border pt-4" : ""}>
              <p className="hint">
                {new Date(`${r.date.slice(0, 10)}T00:00:00Z`).toLocaleDateString(INTL_TAG[f.locale], {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </p>
              <p className="font-bold">{r.title}</p>
              <ul className="mt-2 space-y-1.5 text-sm text-muted">
                {r.items.map((it) => (
                  <li key={it.title}>
                    <span className="font-semibold text-foreground">{it.title}:</span> {it.text}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Section>

      <Section icon={History} title={t("dbTitle")} hint={t("dbHint")}>
        <p className="text-sm text-muted">
          {obs.fares || obs.hotels
            ? t("dbText", { fares: f.num(obs.fares), routes: f.num(obs.routes), hotels: f.num(obs.hotels), since: obs.since ? f.day(obs.since) : "" })
            : t("dbEmpty")}
        </p>
      </Section>

      <details className="card group text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-muted">
            <Database className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">{t("sourcesTitle")}</span>
            <span className="hint">{t("sourcesHint")}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-muted transition group-open:rotate-180" />
        </summary>
        <ul className="mt-4 space-y-1.5 text-muted">
          <li>{t("srcRyanair")}</li>
          <li>{t("srcScreen", { p: providerText(flightProviders.screen) })}</li>
          <li>{t("srcConfirm", { p: providerText(flightProviders.confirm) })}</li>
          <li>{t("srcHotels")}</li>
          <li>{process.env.TRIPADVISOR_KEY ? t("srcTripadvisorKey") : t("srcTripadvisorNoKey")}</li>
          <li>{t("srcHotelFallback", { p: hotelProvider === "none" ? t("providerNoneYet") : providerText(hotelProvider) })}</li>
          <li>{t("srcFlixbus")}</li>
          <li>{t("srcTransit")}</li>
          <li>{t("srcTaxi")}</li>
          <li>{t("srcHolidays")}</li>
        </ul>
        {process.env.SERPAPI_KEY && serp.limit !== Infinity && (
          <p className="hint mt-3">
            {t("liveSearches", { month: serp.usedMonth, limit: serp.limit, today: serp.usedToday, budget: serp.todayBudget })}
          </p>
        )}
      </details>

      {/* Versión publicada: si en el móvil sale la misma que aquí, tienes la última. */}
      <p className="hint text-center">
        {t("version", { v: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? t("versionLocal") })}
        {process.env.VERCEL_GIT_COMMIT_MESSAGE ? ` · ${process.env.VERCEL_GIT_COMMIT_MESSAGE.split("\n")[0]}` : ""}
      </p>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SettingsContent />
    </Suspense>
  );
}
