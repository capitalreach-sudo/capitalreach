"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";
import { TractionChart, type MetricPoint } from "@/components/startup/traction-chart";

/**
 * Record this month's numbers; see the curve investors will see.
 *
 * The whole feature lives or dies on the founder actually recording months,
 * so the recorder sits on the dashboard they already visit, defaults to the
 * current month, and takes four optional numbers -- a pre-revenue company
 * records users and leaves MRR blank. The chart underneath is the exact
 * component the listing renders to financial-tier investors: what you see is
 * what they get.
 */
export function MetricsRecorder() {
  const { t } = useTranslation();
  const [points, setPoints] = useState<MetricPoint[]>([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [form, setForm] = useState({ mrr: "", arr: "", userCount: "", payingCustomers: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/metrics");
    if (res.ok) setPoints((await res.json()).metrics ?? []);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true);
    const res = await fetch("/api/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, ...form }),
    });
    setBusy(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { notify.error(json.error || t("traction.saveFailed")); return; }
    notify.success(t("traction.saved"));
    setForm({ mrr: "", arr: "", userCount: "", payingCustomers: "" });
    load();
  }

  const input: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", background: "var(--cr-paper-3)",
    border: "1px solid var(--cr-rule-dark)", borderRadius: "4px",
    fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", color: "var(--cr-ink)",
    padding: "8px 10px", outline: "none",
  };
  const lab: React.CSSProperties = {
    fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
    color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em",
    display: "block", marginBottom: "4px",
  };

  return (
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px", marginTop: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <TrendingUp style={{ width: 13, height: 13, color: "var(--cr-copper)" }} />
        <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>
          {t("traction.title")}
        </h3>
      </div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", lineHeight: 1.6, marginBottom: "14px" }}>
        {t("traction.sub")}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "10px", marginBottom: "12px" }}>
        <div>
          <label style={lab}>{t("traction.month")}</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={input} />
        </div>
        <div>
          <label style={lab}>MRR</label>
          <input inputMode="numeric" value={form.mrr} placeholder="—"
            onChange={(e) => setForm((f) => ({ ...f, mrr: e.target.value }))} style={input} />
        </div>
        <div>
          <label style={lab}>ARR</label>
          <input inputMode="numeric" value={form.arr} placeholder="—"
            onChange={(e) => setForm((f) => ({ ...f, arr: e.target.value }))} style={input} />
        </div>
        <div>
          <label style={lab}>{t("traction.users")}</label>
          <input inputMode="numeric" value={form.userCount} placeholder="—"
            onChange={(e) => setForm((f) => ({ ...f, userCount: e.target.value }))} style={input} />
        </div>
        <div>
          <label style={lab}>{t("traction.customers")}</label>
          <input inputMode="numeric" value={form.payingCustomers} placeholder="—"
            onChange={(e) => setForm((f) => ({ ...f, payingCustomers: e.target.value }))} style={input} />
        </div>
      </div>

      <button onClick={save} disabled={busy}
        style={{ background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", padding: "9px 18px", cursor: "pointer", opacity: busy ? 0.6 : 1, marginBottom: points.length >= 2 ? "18px" : 0 }}>
        {busy ? t("common.saving") : t("traction.record")}
      </button>

      <TractionChart points={points} />
    </div>
  );
}
