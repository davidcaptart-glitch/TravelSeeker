import { Suspense } from "react";
import Loading from "@/app/loading";
import { AlertForm } from "@/components/AlertForm";
import { toISO } from "@/lib/dates";
import { currentUserId } from "@/lib/session";

async function NewAlertContent() {
  await currentUserId();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="eyebrow">Nueva alerta</h1>
      <AlertForm today={toISO(new Date())} />
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
