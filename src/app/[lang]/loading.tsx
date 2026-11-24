import { getT } from "@/i18n/server";

export default async function Loading() {
  const t = await getT("common");
  return (
    <div className="space-y-4" aria-busy aria-label={t("loading")}>
      <div className="h-32 animate-pulse rounded-3xl bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-44 animate-pulse rounded-3xl bg-surface-2" />
        <div className="h-44 animate-pulse rounded-3xl bg-surface-2" />
      </div>
    </div>
  );
}
