"use client";

import { useState } from "react";
import { Crosshair } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";

/**
 * "Target this investor" on the investor profile, shown only to founder
 * viewers (the server page decides). The founder-side mirror of the
 * investor's save-to-watchlist button, backed by /api/targets.
 */
export function TargetButton({ investorId, initiallyTargeted }: { investorId: string; initiallyTargeted: boolean }) {
  const { t } = useTranslation();
  const [targeted, setTargeted] = useState(initiallyTargeted);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/targets", {
      method: targeted ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ investorId }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      notify.error(j?.error || t("targets.failed"));
      return;
    }
    setTargeted(!targeted);
    notify.success(targeted ? t("targets.removed") : t("targets.added"));
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border transition-colors cursor-pointer ${
        targeted
          ? "bg-cr-copper/10 border-cr-copper/40 text-cr-copper"
          : "bg-transparent border-cr-rule-dark text-cr-i3 hover:border-cr-copper/40 hover:text-cr-copper"
      }`}
    >
      <Crosshair className="h-3 w-3" />
      {targeted ? t("targets.targeted") : t("targets.target")}
    </button>
  );
}
