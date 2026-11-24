"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { linkDevice, type FormState } from "@/app/actions";
import { useT } from "@/i18n/client";

export function LinkDeviceForm({ userId }: { userId: string }) {
  const t = useT("settings");
  const [state, action, pending] = useActionState<FormState, FormData>(linkDevice, undefined);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <div>
        <p className="label">{t("yourId")}</p>
        <div className="flex items-center gap-2 rounded-2xl bg-surface-2 p-1 ps-3.5">
          <p className="min-w-0 flex-1 truncate font-mono text-sm select-all">{userId}</p>
          <button
            type="button"
            className="btn-ghost min-h-9 shrink-0 px-3"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(userId);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {}
            }}
          >
            {copied ? <Check className="h-4 w-4 text-good" /> : <Copy className="h-4 w-4" />}
            {copied ? t("copied") : t("copy")}
          </button>
        </div>
        <p className="hint mt-1.5">{t("idHint")}</p>
      </div>
      <form action={action} className="space-y-2 border-t border-border pt-4">
        <label className="label" htmlFor="userId">
          {t("useOtherLabel")}
        </label>
        <div className="flex gap-2">
          <input id="userId" name="userId" className="input min-w-0 flex-1 font-mono" placeholder="xxxxxxxx-xxxx-…" autoComplete="off" />
          <button className="btn-ghost shrink-0" disabled={pending}>
            {pending ? t("checking") : t("use")}
          </button>
        </div>
        {state?.error && (
          <p role="alert" className="text-sm text-warn">
            {state.error}
          </p>
        )}
        <p className="hint">{t("reenableHint")}</p>
      </form>
    </div>
  );
}
