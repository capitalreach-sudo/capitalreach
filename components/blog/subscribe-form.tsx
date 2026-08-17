"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

/** Dispatch subscription — POST /api/subscribe. Inline states, no alerts. */
export function SubscribeForm() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy"); setMsg(null);
    try {
      const res = await fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, source: "blog" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setState("error"); setMsg(data.error || t("errors.generic")); return; }
      setState("done"); setMsg(data.already ? t("blog.subscribeAlready") : t("blog.subscribeDone"));
    } catch {
      setState("error"); setMsg(t("errors.generic"));
    }
  }

  return (
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "6px", padding: "22px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
        <Mail style={{ width: 16, height: 16, color: "var(--cr-copper)" }} />
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)" }}>{t("blog.subscribeTitle")}</p>
      </div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12.5px", color: "var(--cr-ink-3)", marginBottom: "14px", lineHeight: 1.5 }}>{t("blog.subscribeSub")}</p>
      {state === "done" ? (
        <p role="status" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-up)" }}>✓ {msg}</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col sm:flex-row" style={{ gap: "8px" }}>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder={t("blog.subscribePlaceholder")} aria-label={t("blog.subscribePlaceholder")}
            style={{ flex: 1, minWidth: 0, height: "42px", padding: "0 14px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "var(--cr-ink)", outline: "none" }}
          />
          <button type="submit" disabled={state === "busy"} className="btn-copper-shimmer"
            style={{ height: "42px", padding: "0 18px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", cursor: "pointer", opacity: state === "busy" ? 0.6 : 1, whiteSpace: "nowrap" }}>
            {state === "busy" ? t("common.saving") : t("blog.subscribeCta")}
          </button>
        </form>
      )}
      {state === "error" && msg && <p role="alert" style={{ marginTop: "8px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-down)" }}>{msg}</p>}
    </div>
  );
}
