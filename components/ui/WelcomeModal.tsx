"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useEscapeKey } from "@/hooks/useEscapeKey";

/**
 * One-time welcome after onboarding. Triggered by ?welcome=1 (set by both
 * onboarding flows) and remembered in localStorage per role so it never shows
 * twice. Role-specific next steps; dismissable; the query param is stripped
 * so a refresh does not re-open it.
 */
export function WelcomeModal({ role }: { role: "startup" | "investor" }) {
  const { t } = useTranslation();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The exit is a real animation, not an instant unmount: `closing` keeps
  // the dialog mounted (in the "closed" data-state, so cr-modal-in/out plays
  // in reverse) for the exit's duration before `open` actually flips false.
  const [closing, setClosing] = useState(false);
  const key = `cr_welcomed_${role}`;

  useEffect(() => {
    if (sp.get("welcome") !== "1") return;
    try { if (localStorage.getItem(key)) return; } catch { /* private mode */ }
    setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  function close() {
    try { localStorage.setItem(key, new Date().toISOString()); } catch { /* ignore */ }
    router.replace(pathname);
    const reduced = typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setOpen(false); return; }
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); }, 190);
  }
  useEscapeKey(open, close);
  if (!open) return null;

  const steps: Array<[string, string]> = role === "startup"
    ? [[t("welcome.f1"), "/dashboard/startup/edit"], [t("welcome.f2"), "/dashboard/startup/documents"], [t("welcome.f3"), "/investors"]]
    : [[t("welcome.i1"), "/startups"], [t("welcome.i2"), "/dashboard/investor/settings"], [t("welcome.i3"), "/ai#match"]];

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="welcome-title"
      className="cr-modal-scrim" data-state={closing ? "closed" : "open"}
      style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(26,22,18,0.55)", padding: "16px" }}
      onClick={close}>
      <div className="cr-modal-panel" data-state={closing ? "closed" : "open"} onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "6px", width: "100%", maxWidth: "460px", padding: "28px", position: "relative", boxShadow: "0 24px 64px rgba(26,22,18,0.25)" }}>
        <button onClick={close} aria-label={t("common.close")} style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex" }}>
          <X style={{ width: 16, height: 16 }} />
        </button>
        <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("welcome.eyebrow")}</div>
        {/* Roman, not italic (design-consistency pass, 2026-09-14): this is a
            transactional in-app moment, not the marketing voice -- brought in
            line with the roman Ledger convention (S1) along with the rest of
            the app's functional surfaces. */}
        <h2 id="welcome-title" style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 700, fontSize: "22px", color: "var(--cr-ink)", letterSpacing: "-0.01em", marginBottom: "8px" }}>
          {role === "startup" ? t("welcome.founderTitle") : t("welcome.investorTitle")}
        </h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.6, marginBottom: "16px" }}>
          {role === "startup" ? t("welcome.founderBody") : t("welcome.investorBody")}
        </p>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "8px", marginBottom: "16px" }}>
          {steps.map(([label, href], i) => (
            <li key={href}>
              <Link href={href} onClick={close}
                style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 12px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "4px", textDecoration: "none" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, color: "var(--cr-copper)", flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)" }}>{label}</span>
                <span style={{ marginLeft: "auto", color: "var(--cr-copper)", fontSize: "13px" }}>→</span>
              </Link>
            </li>
          ))}
        </ol>
        <button onClick={close} className="btn-copper-shimmer"
          style={{ width: "100%", height: "42px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", cursor: "pointer" }}>
          {t("welcome.cta")}
        </button>
      </div>
    </div>
  );
}
