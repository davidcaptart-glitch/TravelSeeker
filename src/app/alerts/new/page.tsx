import { Suspense } from "react";
import Loading from "@/app/loading";
import { AlertForm } from "@/components/AlertForm";
import { toISO } from "@/lib/dates";
import { currentUserId } from "@/lib/session";

async function NewAlertContent() {
  await currentUserId();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva alerta</h1>
        <p className="text-sm text-muted">Dinos cuándo puedes, adónde y por cuánto. Nosotros vigilamos.</p>
      </div>
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
