"use client";

import { Loader2, Pause, Pencil, Play, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { removeAlert, runNow, toggleAlert } from "@/app/actions";
import { useT } from "@/i18n/client";
import { SearchingOverlay } from "./AlertForm";

export function AlertActions({ id, active }: { id: string; active: boolean }) {
  const t = useT("alerts");
  const [searching, startSearch] = useTransition();
  const [pending, start] = useTransition();
  const busy = searching || pending;
  return (
    <div className="flex items-center gap-2">
      {searching && <SearchingOverlay />}
      <button className="btn-primary flex-1 whitespace-nowrap sm:flex-none" disabled={busy} onClick={() => startSearch(() => runNow(id))}>
        {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {searching ? t("searching") : t("searchNow")}
      </button>
      <Link href={`/alerts/${id}/edit`} className="btn-ghost w-11 px-0 sm:w-auto sm:px-4" aria-label={t("edit")}>
        <Pencil className="h-4 w-4" /> <span className="hidden sm:inline">{t("edit")}</span>
      </Link>
      <button
        className="btn-ghost w-11 px-0"
        disabled={busy}
        onClick={() => start(() => toggleAlert(id, !active))}
        aria-label={active ? t("pause") : t("resume")}
        title={active ? t("pause") : t("resume")}
      >
        {active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <button
        className="btn-ghost w-11 px-0 text-danger"
        disabled={busy}
        aria-label={t("delete")}
        title={t("delete")}
        onClick={() => {
          if (confirm(t("confirmDelete"))) start(() => removeAlert(id));
        }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
