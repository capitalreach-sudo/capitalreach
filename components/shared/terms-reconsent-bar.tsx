"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";

/**
 * Re-consent bar. Terms carry a version (lib/terms-version); acceptances are
 * recorded per version. When the Terms change materially — the
 * non-circumvention clause the 2% fee depends on was added this way — every
 * existing user must re-accept, or the clause binds nobody who signed up
 * before it. Non-blocking by design: it asks, it doesn't wall.
 */
export function TermsReconsentBar() {
  const { t } = useTranslation();
  const [needs, setNeeds] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/account/accept-terms")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && j.current === false) setNeeds(true); })
      .catch(() => {});
  }, []);

  if (!needs) return null;

  async function accept() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/accept-terms", { method: "POST" });
      if (!res.ok) throw new Error();
      setNeeds(false);
      notify.success(t("terms.reconsentDone"));
    } catch {
      notify.error(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="region" aria-label={t("terms.reconsentTitle")}
      style={{ background: "var(--cr-copper-bg)", borderBottom: "1px solid var(--cr-copper-br)", padding: "10px 24px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
        <p style={{ flex: 1, minWidth: "260px", fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-2)", margin: 0, lineHeight: 1.5 }}>
          <strong style={{ color: "var(--cr-ink)" }}>{t("terms.reconsentTitle")}</strong>{" "}
          {t("terms.reconsentBody")}{" "}
          <Link href="/terms" style={{ color: "var(--cr-copper)" }}>{t("terms.reconsentRead")}</Link>
        </p>
        <button onClick={accept} disabled={busy}
          style={{ background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", padding: "8px 16px", cursor: "pointer", opacity: busy ? 0.6 : 1, whiteSpace: "nowrap" }}>
          {busy ? t("common.saving") : t("terms.reconsentAccept")}
        </button>
      </div>
    </div>
  );
}
