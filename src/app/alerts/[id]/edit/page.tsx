import { Suspense } from "react";
import Loading from "@/app/loading";
import { notFound } from "next/navigation";
import { AlertForm } from "@/components/AlertForm";
import { toISO } from "@/lib/dates";
import { getAlert } from "@/lib/repo";
import { currentUserId } from "@/lib/session";

async function EditAlertContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = await getAlert(id, await currentUserId());
  if (!alert) notFound();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Editar “{alert.config.name}”</h1>
      <AlertForm id={id} initial={alert.config} today={toISO(new Date())} />
    </div>
  );
}

export default function EditAlertPage({ params }: PageProps<"/alerts/[id]/edit">) {
  return (
    <Suspense fallback={<Loading />}>
      <EditAlertContent params={params} />
    </Suspense>
  );
}
