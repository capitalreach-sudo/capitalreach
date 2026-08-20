"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Check } from "lucide-react";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * The waitlist button, where the interest button would be if the round were
 * open. A closed round used to be a dead end; the demand it generates is
 * worth catching at exactly the moment it exists.
 *
 * The count is shown to everyone — "3 waiting" is social proof that costs
 * nobody's privacy, because it is a number, not a name.
 */
export function WaitlistButton({ startupId, roundState }: { startupId: string; roundState: string }) {
  const { t } = useTranslation();
  const [joined, setJoined] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/startups/waitlist?startupId=${startupId}`);
    if (!res.ok) return;
    const j = await res.json();
    setJoined(!!j.joined);
    setCount(j.count ?? 0);
  }, [startupId]);
  useEffect(() => { void load(); }, [load]);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (joined) {
        await fetch(`/api/startups/waitlist?startupId=${startupId}`, { method: "DELETE" });
        setJoined(false); setCount(c => Math.max(0, c - 1));
      } else {
        const res = await fetch("/api/startups/waitlist", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startupId }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { notify.error(j.error || t("errors.generic")); return; }
        setJoined(true); setCount(c => c + 1);
        notify.success(t("waitlist.joined"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={toggle} disabled={busy}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: joined ? "var(--cr-up-bg)" : "var(--cr-paper-2)",
        border: `1px solid ${joined ? "rgba(45,106,79,0.3)" : "var(--cr-rule-dark)"}`,
        borderRadius: 4, padding: "8px 16px", cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13,
        color: joined ? "var(--cr-up)" : "var(--cr-ink-2)",
      }}>
      {joined ? <Check style={{ width: 13, height: 13 }} /> : <Clock style={{ width: 13, height: 13 }} />}
      {joined
        ? t("waitlist.onIt")
        : roundState === "oversubscribed" ? t("waitlist.joinIfSpace") : t("waitlist.joinNextRaise")}
      {count > 0 && (
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 400, fontSize: 11, color: "var(--cr-ink-4)" }}>
          · {t("waitlist.waitingCount", { n: count })}
        </span>
      )}
    </button>
  );
}
