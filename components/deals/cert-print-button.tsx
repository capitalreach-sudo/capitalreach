"use client";

import { useTranslation } from "@/hooks/useTranslation";

/** Print-to-PDF is the download: dependency-free and faithful to A4. */
export function CertPrintButton() {
  const { t } = useTranslation();
  return (
    <button onClick={() => window.print()} className="no-print"
      style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "var(--cr-copper)", color: "#fff", border: "none", borderRadius: "999px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", padding: "12px 26px", cursor: "pointer" }}>
      {t("cert.print")}
    </button>
  );
}
