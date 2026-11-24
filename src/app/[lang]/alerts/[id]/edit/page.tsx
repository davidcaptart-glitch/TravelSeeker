import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "@/app/[lang]/loading";
import { AlertForm } from "@/components/AlertForm";
import { MoneyProvider } from "@/i18n/client";
import { getMoney, getT } from "@/i18n/server";
import { toISO } from "@/lib/dates";
import { getAlert } from "@/lib/repo";
import { currentUserId } from "@/lib/session";

async function EditAlertContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = await getAlert(id, await currentUserId());
  if (!alert) notFound();
  const t = await getT("alerts");
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href={`/alerts/${id}`} className="eyebrow-pill transition hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5 rtl:-scale-x-100" /> {t("editTitle", { name: alert.config.name })}
      </Link>
      <MoneyProvider money={await getMoney()}>
        <AlertForm id={id} initial={alert.config} today={toISO(new Date())} />
      </MoneyProvider>
    </div>
  );
}

export default function EditAlertPage({ params }: PageProps<"/[lang]/alerts/[id]/edit">) {
  return (
    <Suspense fallback={<Loading />}>
      <EditAlertContent params={params} />
    </Suspense>
  );
}
