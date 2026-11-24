import { Suspense } from "react";
import Loading from "@/app/[lang]/loading";
import { AlertForm } from "@/components/AlertForm";
import { MoneyProvider } from "@/i18n/client";
import { getMoney, getT } from "@/i18n/server";
import { toISO } from "@/lib/dates";
import { currentUserId } from "@/lib/session";

async function NewAlertContent() {
  await currentUserId();
  const t = await getT("alerts");
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="eyebrow-pill">{t("newTitle")}</h1>
      <MoneyProvider money={await getMoney()}>
        <AlertForm today={toISO(new Date())} />
      </MoneyProvider>
    </div>
  );
}

export default function NewAlertPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewAlertContent />
    </Suspense>
  );
}
