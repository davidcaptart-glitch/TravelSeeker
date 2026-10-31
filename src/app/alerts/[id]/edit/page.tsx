import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "@/app/loading";
import { AlertForm } from "@/components/AlertForm";
import { toISO } from "@/lib/dates";
import { getAlert } from "@/lib/repo";
import { currentUserId } from "@/lib/session";

async function EditAlertContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = await getAlert(id, await currentUserId());
  if (!alert) notFound();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href={`/alerts/${id}`} className="eyebrow-pill transition hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Editar «{alert.config.name}»
      </Link>
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
