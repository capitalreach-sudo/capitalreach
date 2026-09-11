"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
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

const BOX: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  borderRadius: 4, padding: "8px 16px",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13,
};

export function InterestedButton({ targetType, targetId }: {
  targetType: "startup" | "investor";
  targetId: string;
}) {
  const { t } = useTranslation();
  const [interested, setInterested] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/interest?targetType=${targetType}&targetId=${targetId}`);
      if (!res.ok) { setInterested(false); return; }
      setInterested(!!(await res.json()).interested);
    } catch {
      // A dropped request used to leave this null forever, and null renders
      // nothing: the control was simply absent from the row.
      setInterested(false);
    }
  }, [targetType, targetId]);
  useEffect(() => { void load(); }, [load]);

  async function toggle() {
    if (busy || interested === null) return;
    setBusy(true);
    try {
      if (interested) {
        const res = await fetch(`/api/interest?targetType=${targetType}&targetId=${targetId}`, { method: "DELETE" });
        // Withdrawing is silent by design, but a failed withdrawal must not
        // look like it worked -- the signal would be back on the next load.
        if (!res.ok) { notify.error(t("errors.generic")); return; }
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
    } catch {
      notify.error(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  // The row must not reflow when the answer arrives. An action that appears
  // late where nothing was reads as a page still loading, in the one row
  // where people are looking for the button they came for.
  if (interested === null) {
    return (
      <span aria-hidden style={{ ...BOX, visibility: "hidden", border: "1px solid transparent" }}>
        <Sparkles style={{ width: 13, height: 13 }} />
        {t("interest.cta")}
      </span>
    );
  }

  return (
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={interested}
      title={interested ? t("interest.withdraw") : t("interest.hint")}
      style={{
        ...BOX,
        background: interested ? "var(--cr-up-bg)" : "var(--cr-paper-2)",
        border: `1px solid ${interested ? "color-mix(in srgb, var(--cr-up) 30%, transparent)" : "var(--cr-rule-dark)"}`,
        cursor: busy ? "progress" : "pointer",
        opacity: busy ? 0.6 : 1,
        color: interested ? "var(--cr-up)" : "var(--cr-ink-2)",
      }}>
      {interested ? <Check style={{ width: 13, height: 13 }} /> : <Sparkles style={{ width: 13, height: 13 }} />}
      {interested ? t("interest.marked") : t("interest.cta")}
    </button>
  );
}
