"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";

/** Quiet escape hatch for an account created with the wrong type. The server
 *  refuses once the account owns a profile, so this can never orphan one. */
export function RoleSwitchLink({ to }: { to: "startup" | "investor" }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/switch-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: to }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) {
      router.push(`/onboarding/${to}`);
      router.refresh();
      return;
    }
    setBusy(false);
    setError(json?.messageKey ? t(json.messageKey) : t("roleSwitch.failed"));
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
      <button type="button" onClick={run} disabled={busy}
        style={{ background: "none", border: "none", padding: "8px 0", minHeight: "40px", cursor: busy ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-3)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
        {to === "investor" ? t("roleSwitch.toInvestor") : t("roleSwitch.toFounder")}
      </button>
      {error && <span role="alert" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-down)" }}>{error}</span>}
    </span>
  );
}
