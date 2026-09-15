"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";
import { useReadOnly } from "@/components/dashboard/read-only";
import { TractionChart, type MetricPoint } from "@/components/startup/traction-chart";

/**
 * Record this month's numbers; see the curve investors will see.
 *
 * The whole feature lives or dies on the founder actually recording months,
 * so the recorder sits in the Round section of the dashboard they already
 * visit, defaults to the current month, and takes four optional numbers -- a
 * pre-revenue company records users and leaves MRR blank. The chart
 * underneath is the exact component the listing renders to financial-tier
 * investors: what you see is what they get, and it draws nothing until two
 * months exist.
 *
 * The row opens and closes in place. `openOnHash` is the anchor that brings a
 * founder here from elsewhere (the traction step in Next steps), so arriving
 * by that link finds the form already open.
 *
 * Success is silent: the saved month appears in the chart, which is the
 * confirmation. Only a failure speaks.
 *
 * Inline-styled to match the founder dashboard it mounts in
 * (components/dashboard/startup-dashboard-client.tsx): this used to render
 * through Ledger, the Apple Design component system the dashboard itself was
 * reverted away from.
 */
export function MetricsRecorder({ openOnHash }: { openOnHash?: string }) {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const tf = (key: string, fallback: string) => {
    const out = t(key);
    return out === key ? fallback : out;
  };
  const [points, setPoints] = useState<MetricPoint[]>([]);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [form, setForm] = useState({ mrr: "", arr: "", userCount: "", payingCustomers: "" });
  const [busy, setBusy] = useState(false);
  const formId = useId();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/metrics");
      if (res.ok) setPoints((await res.json()).metrics ?? []);
    } catch { /* the chart simply does not render; the form still works */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Arriving on the anchor means the founder came here to record a month.
  useEffect(() => {
    if (!openOnHash || readOnly) return;
    const match = () => { if (window.location.hash === openOnHash) setOpen(true); };
    match();
    window.addEventListener("hashchange", match);
    return () => window.removeEventListener("hashchange", match);
  }, [openOnHash, readOnly]);

  // The API's own ceilings, checked at the field so a wrong figure is caught
  // where it was typed rather than after a round trip.
  const LIMITS: Record<keyof typeof form, number> = {
    mrr: 100_000_000,
    arr: 1_200_000_000,
    userCount: 1_000_000_000,
    payingCustomers: 1_000_000_000,
  };
  const badFields = (Object.keys(form) as Array<keyof typeof form>).filter((k) => {
    const raw = form[k].trim();
    if (raw === "") return false;
    const n = Number(raw);
    return !Number.isFinite(n) || n < 0 || n > LIMITS[k];
  });

  async function save() {
    if (readOnly || busy || badFields.length > 0) return;
    setBusy(true);
    const res = await fetch("/api/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, ...form }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      const json = res ? await res.json().catch(() => ({})) : {};
      notify.error(json.error || t("traction.saveFailed"));
      return;
    }
    setForm({ mrr: "", arr: "", userCount: "", payingCustomers: "" });
    setOpen(false);
    void load();
  }

  const fields: Array<{ key: keyof typeof form; label: string }> = [
    { key: "mrr", label: "MRR" },
    { key: "arr", label: "ARR" },
    { key: "userCount", label: t("traction.users") },
    { key: "payingCustomers", label: t("traction.customers") },
  ];

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: "4px",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: "13px",
    lineHeight: 1.4,
    color: "var(--cr-ink-3)",
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "8px" }}>
        <h3 className="ruled-label" data-cr-visible="1">{tf("dashboard.startup.recordMonth", "Record this month's numbers")}</h3>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={open ? formId : undefined}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)", flexShrink: 0 }}
          >
            {open ? t("common.cancel") : t("traction.record")}
          </button>
        )}
      </div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: open ? "16px" : 0 }}>
        {t("traction.sub")}
      </p>
      {open && !readOnly && (
        <form
          id={formId}
          onSubmit={(e) => { e.preventDefault(); void save(); }}
          style={{ display: "flex", flexDirection: "column", gap: "12px", paddingTop: "16px", borderTop: "1px solid var(--cr-rule)" }}
        >
          <div>
            <label style={labelStyle} htmlFor={`${formId}month`}>{t("traction.month")}</label>
            <input
              id={`${formId}month`}
              type="month"
              className="cr-input"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          {fields.map((f) => {
            const invalid = badFields.includes(f.key);
            return (
              <div key={f.key}>
                <label style={labelStyle} htmlFor={`${formId}${f.key}`}>{f.label}</label>
                <input
                  id={`${formId}${f.key}`}
                  inputMode="numeric"
                  className="cr-input"
                  value={form[f.key]}
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? `${formId}${f.key}err` : undefined}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
                {invalid && (
                  <p id={`${formId}${f.key}err`} role="alert" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-down)", marginTop: "4px" }}>
                    {tf("dashboard.startup.figureRange", "Enter a plain number, or leave it blank.")}
                  </p>
                )}
              </div>
            );
          })}
          <div>
            <button
              type="submit"
              className="cr-btn cr-btn--primary"
              disabled={busy || badFields.length > 0}
              aria-busy={busy || undefined}
            >
              {busy ? t("common.saving") : t("traction.record")}
            </button>
          </div>
        </form>
      )}
      {/* Two months or more, or nothing: one bar is a number, not a curve. */}
      <TractionChart points={points} />
    </div>
  );
}
