import { Bookmark } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import Loading from "@/app/[lang]/loading";
import { OfferCard } from "@/components/OfferCard";
import { getT } from "@/i18n/server";
import { savedMatches } from "@/lib/repo";
import { currentUserId } from "@/lib/session";

async function SavedContent() {
  const userId = await currentUserId();
  const all = await savedMatches(userId);
  const booked = all.filter((m) => m.status === "booked");
  const saved = all.filter((m) => m.status === "saved");
  const t = await getT("saved");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("lead")}</p>
      </div>

      {booked.length > 0 && (
        <section className="space-y-3">
          <h2 className="eyebrow">{t("booked")}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {booked.map((m, i) => (
              <OfferCard key={m.id} m={m} index={i} />
            ))}
          </div>
        </section>
      )}

      {saved.length > 0 ? (
        <section className="space-y-3">
          {booked.length > 0 && <h2 className="eyebrow">{t("later")}</h2>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {saved.map((m, i) => (
              <OfferCard key={m.id} m={m} index={i} />
            ))}
          </div>
        </section>
      ) : (
        <section className="card flex flex-col items-center gap-3 py-10 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-cyan">
            <Bookmark className="h-7 w-7" />
          </span>
          <p className="text-lg font-bold">{t("emptyTitle")}</p>
          <p className="max-w-sm text-sm text-muted">{t("emptyText")}</p>
          <Link href="/" className="btn-primary mt-2">
            {t("viewOffers")}
          </Link>
        </section>
      )}
    </div>
  );
}

export default function SavedPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SavedContent />
    </Suspense>
  );
}
