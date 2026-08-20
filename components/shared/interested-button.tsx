"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";

/**
 * "I'm interested" — the signal the OTHER side gets to hear.
 *
 * A watchlist save and a target are private bookmarks; a deal proposal
 * carries an amount and obligations. This is the register between: one
 * click, one notification to the profile's owner, no numbers attached.
 * Toggling it off is silent — interest withdrawn quietly is kinder than a
 * "no longer interested" bell — and re-toggling never re-notifies (the
 * server dedupes on the unique pair).
 */
export function InterestedButton({ targetType, targetId }: {
  targetType: "startup" | "investor";
  targetId: string;
}) {
  const { t } = useTranslation();
  const [interested, setInterested] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/interest?targetType=${targetType}&targetId=${targetId}`);
    if (!res.ok) { setInterested(false); return; }
    setInterested(!!(await res.json()).interested);
  }, [targetType, targetId]);
  useEffect(() => { void load(); }, [load]);

  async function toggle() {
    if (busy || interested === null) return;
    setBusy(true);
    try {
      if (interested) {
        await fetch(`/api/interest?targetType=${targetType}&targetId=${targetId}`, { method: "DELETE" });
        setInterested(false);
      } else {
        const res = await fetch("/api/interest", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetType, targetId }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { notify.error(j.error || t("errors.generic")); return; }
        setInterested(true);
        notify.success(t("interest.sent"));
      }
    } finally {
      setBusy(false);
    }
  }

  if (interested === null) return null;
  return (
    <button onClick={toggle} disabled={busy}
      title={interested ? t("interest.withdraw") : t("interest.hint")}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: interested ? "var(--cr-up-bg)" : "var(--cr-paper-2)",
        border: `1px solid ${interested ? "rgba(45,106,79,0.3)" : "var(--cr-rule-dark)"}`,
        borderRadius: 4, padding: "8px 16px", cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13,
        color: interested ? "var(--cr-up)" : "var(--cr-ink-2)",
      }}>
      {interested ? <Check style={{ width: 13, height: 13 }} /> : <Sparkles style={{ width: 13, height: 13 }} />}
      {interested ? t("interest.marked") : t("interest.cta")}
    </button>
  );
}
