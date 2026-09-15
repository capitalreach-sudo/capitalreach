"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { LedgerLoader } from "@/components/ui/LedgerLoader";
import { COUNTRIES, normalizeCountry } from "@/lib/countries";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { notify } from "@/components/ui/toast-notify";
import { Navbar } from "@/components/shared/navbar";
import { ArrowLeft, Save, X, Check, Loader2, ImagePlus } from "lucide-react";
import { listingCompleteness } from "@/lib/listing-completeness";
import Link from "next/link";
import { INDUSTRIES, STAGES } from "@/types";
import type { StartupFounder } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { InfoTip } from "@/components/shared/info-tip";
import { LogoUploader } from "@/components/shared/logo-uploader";

// ── Constants ─────────────────────────────────────────────────────────────────

const BUSINESS_MODELS = ["B2B", "B2C", "B2B2C", "Marketplace", "SaaS", "Hardware", "Open Source + Enterprise", "Transactional", "Other"];
const REVENUE_MODELS  = ["Subscription", "Usage-based", "One-time", "Freemium", "Commission", "Advertising", "Licensing", "Services", "Other"];
const COMPANY_TYPES   = ["C-Corp", "LLC", "S-Corp", "PBC (Public Benefit Corp)", "Sole Proprietorship", "Not yet incorporated"];
const TEAM_SIZES      = ["Solo founder", "2–5", "6–10", "11–25", "26–50", "51–100", "100+"];
const DECK_LANGUAGES  = ["English", "German", "Both", "Other"];
const LOOKING_FOR_OPTIONS = [
  { value: "Capital",             labelKey: "dashboard.lf1" },
  { value: "Strategic investors", labelKey: "dashboard.lf2" },
  { value: "Board member",        labelKey: "dashboard.lf3" },
  { value: "Mentorship",          labelKey: "dashboard.lf4" },
  { value: "Co-founder",          labelKey: "dashboard.lf5" },
  { value: "Customers",           labelKey: "dashboard.lf6" },
];
const TARGET_MARKET_OPTIONS = [
  { value: "Germany", labelKey: "dashboard.tm1" },
  { value: "DACH",    labelKey: "dashboard.tm2" },
  { value: "Europe",  labelKey: "dashboard.tm3" },
  { value: "Global",  labelKey: "dashboard.tm4" },
  { value: "US",      labelKey: "dashboard.tm5" },
  { value: "UK",      labelKey: "dashboard.tm6" },
  { value: "Asia",    labelKey: "dashboard.tm7" },
];
// Migration 141 (rich profiles).
const INSTRUMENT_OPTIONS = ["SAFE", "Equity", "Convertible Note", "Revenue Share", "Debt"];
const LEAD_STATUS_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: "have_lead",    labelKey: "dashboard.leadStatusHave" },
  { value: "seeking_lead", labelKey: "dashboard.leadStatusSeeking" },
  { value: "open",         labelKey: "dashboard.leadStatusOpen" },
];

// ── Shared form element styles ────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
  fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "uppercase",
  letterSpacing: "0.07em", marginBottom: "6px",
};

const inputStyle: React.CSSProperties = {
  width: "100%", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300,
  fontSize: "14px", color: "var(--cr-ink)", padding: "9px 12px", outline: "none",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: "vertical", minHeight: "90px", lineHeight: 1.6,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238B7355' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
  paddingRight: "30px", cursor: "pointer",
};

const sectionStyle: React.CSSProperties = {
  background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px", padding: "24px 28px",
};

const sectionHeadStyle: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px",
  color: "var(--cr-ink)", marginBottom: "20px",
};

// ── TagInput ─────────────────────────────────────────────────────────────────

function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (tags: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");

  function add() {
    const v = input.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
    else if (e.key === "Backspace" && !input && tags.length > 0) onChange(tags.slice(0, -1));
  }

  return (
    <div style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "8px 10px", background: "var(--cr-paper-3)", display: "flex", flexWrap: "wrap", gap: "6px", minHeight: "42px", alignItems: "center" }}>
      {tags.map(tag => (
        <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", borderRadius: "3px", padding: "3px 8px" }}>
          {tag}
          <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-copper)", display: "flex", padding: "0" }}>
            <X style={{ width: 10, height: 10 }} />
          </button>
        </span>
      ))}
      <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} onBlur={add}
        placeholder={tags.length === 0 ? (placeholder ?? "Type and press Enter…") : ""}
        style={{ flex: 1, minWidth: "120px", background: "transparent", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)" }} />
    </div>
  );
}

// ── RepeaterField ────────────────────────────────────────────────────────────
//
// The one generic row editor migration 141 needs six of (key_metrics,
// customers, advisors, press, awards, hiring): add a row, edit its cells,
// remove it. A flex-wrap row rather than a fixed CSS grid, so 3-4 short
// fields reflow to their own line at 390px instead of forcing the page to
// scroll sideways -- the standing "no horizontal scroll at 390px" rule.
interface RepeaterFieldSpec<T extends Record<string, string>> {
  key: keyof T & string;
  placeholder: string;
  type?: "text" | "number" | "date";
  basis?: number;
}

function RepeaterField<T extends Record<string, string>>({
  rows, onChange, fields, emptyRow, addLabel, removeLabel,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  fields: RepeaterFieldSpec<T>[];
  emptyRow: T;
  addLabel: string;
  removeLabel: string;
}) {
  function update(i: number, key: string, value: string) {
    const next = rows.slice();
    next[i] = { ...next[i], [key]: value };
    onChange(next);
  }
  function remove(i: number) { onChange(rows.filter((_, idx) => idx !== i)); }
  function add() { onChange([...rows, { ...emptyRow }]); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {rows.map((row, i) => (
        <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "10px", background: "var(--cr-paper-3)" }}>
          {fields.map((f) => (
            <div key={f.key} style={{ flex: `1 1 ${f.basis ?? 110}px`, minWidth: `${f.basis ?? 110}px` }}>
              <WarmInput
                type={f.type ?? "text"}
                placeholder={f.placeholder}
                value={row[f.key] ?? ""}
                onChange={(e) => update(i, f.key, e.target.value)}
              />
            </div>
          ))}
          <button type="button" onClick={() => remove(i)} aria-label={removeLabel}
            style={{ background: "none", border: "none", color: "var(--cr-ink-4)", cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: "4px", flexShrink: 0 }}>×</button>
        </div>
      ))}
      <button type="button" onClick={add}
        style={{ alignSelf: "flex-start", border: "1px dashed var(--cr-rule-dark)", background: "transparent", color: "var(--cr-ink-3)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", padding: "8px 14px", cursor: "pointer" }}>
        + {addLabel}
      </button>
    </div>
  );
}

// ── Customer logos ───────────────────────────────────────────────────────────
//
// The one repeater that is not a plain text row: each customer is a logo
// upload plus an optional name, per the brief. Upload goes through
// /api/startups/customer-logo (sibling to /api/logo, not a reuse of it --
// that route is one canonical path per ENTITY, which is the wrong shape for
// a list of several marks). A row without a saved id yet gets a client-side
// one purely to give the upload a stable storage path; it is never sent to
// the server as a real id.
interface CustomerRow { _rid: string; name: string; logo_url: string; since: string }

function newCustomerRow(): CustomerRow {
  const rid = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `c${Date.now()}${Math.random().toString(36).slice(2)}`;
  return { _rid: rid, name: "", logo_url: "", since: "" };
}

function CustomerLogosField({ rows, onChange }: { rows: CustomerRow[]; onChange: (rows: CustomerRow[]) => void }) {
  const { t } = useTranslation();
  const [busyIdx, setBusyIdx] = useState<number | null>(null);

  function update(i: number, patch: Partial<CustomerRow>) {
    const next = rows.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function remove(i: number) { onChange(rows.filter((_, idx) => idx !== i)); }
  function add() { onChange([...rows, newCustomerRow()]); }

  async function upload(i: number, file: File) {
    if (busyIdx !== null) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { notify.error(t("logo.typeError")); return; }
    if (file.size > 2 * 1024 * 1024) { notify.error(t("logo.sizeError")); return; }
    setBusyIdx(i);
    try {
      const rid = rows[i]._rid || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `c${Math.random().toString(36).slice(2)}`);
      const form = new FormData();
      form.set("file", file);
      form.set("rowId", rid);
      const res = await fetch("/api/startups/customer-logo", { method: "POST", body: form });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { notify.error(j.error || t("errors.generic")); return; }
      update(i, { logo_url: j.url, _rid: rid });
    } finally {
      setBusyIdx(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {rows.map((row, i) => (
        <div key={row._rid ?? i} style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "10px", background: "var(--cr-paper-3)" }}>
          <label style={{ flexShrink: 0, width: 44, height: 44, borderRadius: "4px", border: "1px dashed var(--cr-rule-dark)", background: row.logo_url ? `var(--cr-paper) url(${row.logo_url}) center/contain no-repeat` : "var(--cr-paper)", display: "flex", alignItems: "center", justifyContent: "center", cursor: busyIdx === i ? "wait" : "pointer" }}>
            {!row.logo_url && (busyIdx === i ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite", color: "var(--cr-ink-4)" }} /> : <ImagePlus style={{ width: 16, height: 16, color: "var(--cr-ink-4)" }} />)}
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(i, f); e.target.value = ""; }} />
          </label>
          <div style={{ flex: "1 1 160px", minWidth: 140 }}>
            <WarmInput placeholder={t("dashboard.customerNamePh")} value={row.name} onChange={(e) => update(i, { name: e.target.value })} />
          </div>
          <div style={{ flex: "1 1 110px", minWidth: 100 }}>
            <WarmInput type="date" value={row.since} onChange={(e) => update(i, { since: e.target.value })} title={t("dashboard.customerSincePh")} />
          </div>
          <button type="button" onClick={() => remove(i)} aria-label={t("dashboard.repeaterRemove")}
            style={{ background: "none", border: "none", color: "var(--cr-ink-4)", cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: "4px", flexShrink: 0 }}>×</button>
        </div>
      ))}
      <button type="button" onClick={add}
        style={{ alignSelf: "flex-start", border: "1px dashed var(--cr-rule-dark)", background: "transparent", color: "var(--cr-ink-3)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", padding: "8px 14px", cursor: "pointer" }}>
        + {t("dashboard.customerAdd")}
      </button>
    </div>
  );
}

// ── WarmInput / WarmTextarea / WarmSelect ────────────────────────────────────

function WarmInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} style={{ ...inputStyle, ...props.style }}
      onFocus={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)")}
      onBlur={e  => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")} />
  );
}

function WarmTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} style={{ ...textareaStyle, ...props.style }}
      onFocus={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)")}
      onBlur={e  => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")} />
  );
}

function WarmSelect(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  const { children, ...rest } = props;
  return (
    <select {...rest} style={{ ...selectStyle, ...rest.style }}
      onFocus={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)")}
      onBlur={e  => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")}>
      {children}
    </select>
  );
}

// ── Toggle ───────────────────────────────────────────────────────────────────

function WarmToggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "14px 16px", background: "var(--cr-paper-3)" }}>
      <div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "14px", color: "var(--cr-ink)" }}>{label}</p>
        {hint && <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "3px" }}>{hint}</p>}
      </div>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        style={{ width: 44, height: 24, borderRadius: "12px", border: "none", background: checked ? "var(--cr-copper)" : "var(--cr-paper-4)", cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 150ms ease" }}>
        <span style={{ position: "absolute", top: "3px", left: checked ? "22px" : "3px", width: 18, height: 18, borderRadius: "9px", background: "#fff", transition: "left 150ms ease" }} />
      </button>
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, children, hint, termKey }: { label: string; children: React.ReactNode; hint?: string; termKey?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}{termKey && <InfoTip termKey={termKey} />}</label>
      {hint && <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "6px" }}>{hint}</p>}
      {children}
    </div>
  );
}

// ── Milestones ────────────────────────────────────────────────────────────────
//
// Onboarding could create milestones; until this section nothing after it
// could, even though the dashboard checklist asks for one. Writes through
// /api/milestones so adding one also notifies savers. Rows are lifted to the
// parent page rather than fetched here: the completeness meter needs the same
// array (see the get_my_startup gap noted where it is fetched), and fetching
// it twice would risk the meter and this list disagreeing about whether a
// milestone exists yet.
function MilestonesSection({ rows, setRows }: { rows: Array<{ id: string; date: string; description: string }>; setRows: React.Dispatch<React.SetStateAction<Array<{ id: string; date: string; description: string }>>> }) {
  const { t } = useTranslation();
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!date || !description.trim() || busy) return;
    setBusy(true);
    const res = await fetch("/api/milestones", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, description: description.trim() }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !json?.milestone) { notify.error(json?.error || t("dashboard.msAddFailed")); return; }
    setRows((r) => [json.milestone, ...r]);
    setDate(""); setDescription("");
    notify.success(t("dashboard.msAdded"));
  }

  async function remove(id: string) {
    const res = await fetch("/api/milestones", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setRows((r) => r.filter((m) => m.id !== id));
  }

  return (
    <section style={sectionStyle}>
      <h2 style={sectionHeadStyle}>{t("dashboard.secMilestones")}</h2>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginBottom: "14px" }}>
        {t("dashboard.msBroadcastHint")}
      </p>
      {/* Auto-sorted (the query already orders by date desc, newest first --
          the edit surface itself, not the deeper diamond-marker timeline
          already built on the revealed profile page) with a thin rule and
          dot so it reads as a timeline rather than a plain list. */}
      <div style={{ display: "flex", flexDirection: "column", marginBottom: rows.length ? "16px" : 0, position: "relative" }}>
        {rows.length > 1 && <div aria-hidden style={{ position: "absolute", left: "3px", top: "6px", bottom: "6px", width: "1px", background: "var(--cr-rule)" }} />}
        {rows.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "baseline", gap: "10px", paddingBottom: "10px", position: "relative", paddingLeft: "16px" }}>
            <span aria-hidden style={{ position: "absolute", left: 0, top: "6px", width: "7px", height: "7px", borderRadius: "50%", background: "var(--cr-copper)", border: "2px solid var(--cr-paper-2)" }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink-4)", whiteSpace: "nowrap" }}>{m.date}</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-2)", flex: 1 }}>{m.description}</span>
            <button type="button" onClick={() => remove(m.id)} aria-label={t("dashboard.msRemove")}
              style={{ background: "none", border: "none", color: "var(--cr-ink-4)", cursor: "pointer", fontSize: "14px", lineHeight: 1 }}>×</button>
          </div>
        ))}
      </div>
      <div className="milestone-row" style={{ gap: "10px", alignItems: "end" }}>
        <Field label={t("dashboard.msDate")}><WarmInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={t("dashboard.msWhat")}><WarmInput value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder={t("dashboard.msPlaceholder")} /></Field>
        <button type="button" onClick={add} disabled={busy || !date || !description.trim()}
          style={{ border: "1px solid var(--cr-copper-br)", background: "transparent", color: "var(--cr-copper)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", padding: "10px 16px", cursor: busy ? "wait" : "pointer", height: "fit-content" }}>
          {busy ? "…" : t("dashboard.msAdd")}
        </button>
      </div>
    </section>
  );
}

// ── Founders (team) ──────────────────────────────────────────────────────────
//
// The single biggest gap this pass closes: onboarding could write
// startup_founders, and nothing after it could. Reuses onboarding's own
// write pattern rather than inventing a second one -- read the prior row
// ids, insert the current valid rows, delete the prior ids once the insert
// has landed (never the other order: a refused insert must not leave a
// founder with neither set). Direct RLS write, not through
// /api/startups/save -- founders are a different table with a different
// trust boundary, and unlike milestones there is no saver notification to
// fire, so there is no reason to route this through an API at all.
interface FounderDraft {
  id?: string;
  name: string; role: string; prev: string;
  linkedin_url: string; twitter_url: string; photo_url: string; bio: string;
}

function emptyFounderDraft(): FounderDraft {
  return { name: "", role: "", prev: "", linkedin_url: "", twitter_url: "", photo_url: "", bio: "" };
}

function FoundersSection({ startupId, initial, onSaved }: {
  startupId: string;
  initial: FounderDraft[];
  onSaved: (rows: StartupFounder[]) => void;
}) {
  const { t } = useTranslation();
  // Renders the fallback until the key lands in every locale.
  const tf = (key: string, fallback: string) => { const out = t(key); return out === key ? fallback : out; };
  const [rows, setRows] = useState<FounderDraft[]>(initial.length ? initial : [emptyFounderDraft()]);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");

  function update(i: number, field: keyof FounderDraft, value: string) {
    setRows((r) => { const next = r.slice(); next[i] = { ...next[i], [field]: value }; return next; });
    setSaveState("idle");
  }
  function add() { setRows((r) => [...r, emptyFounderDraft()]); setSaveState("idle"); }
  function remove(i: number) { setRows((r) => r.filter((_, idx) => idx !== i)); setSaveState("idle"); }

  async function save() {
    if (busy) return;
    setBusy(true);
    const valid = rows.filter((f) => f.name.trim() && f.role.trim());
    if (rows.length > 0 && valid.length === 0) {
      notify.error(t("dashboard.teamNeedNameRole"));
      setBusy(false);
      return;
    }
    // Routed through the server (not a direct client write) so name/role/
    // prev/bio get the same contact-detail masking every other piece of
    // listing prose already gets -- RLS alone only ever scoped ownership,
    // never content.
    const res = await fetch("/api/startups/founders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId, founders: valid }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      notify.error(data?.error || t("errors.generic"));
      setSaveState("error");
      setBusy(false);
      return;
    }
    const written = (data?.founders ?? []) as StartupFounder[];
    setRows(written.length ? written.map((f) => ({
      id: f.id, name: f.name, role: f.role, prev: f.prev ?? "",
      linkedin_url: f.linkedin_url ?? "", twitter_url: f.twitter_url ?? "",
      photo_url: f.photo_url ?? "", bio: f.bio ?? "",
    })) : [emptyFounderDraft()]);
    onSaved(written);
    setSaveState("saved");
    if (data?.masked) notify.info(tf("dashboard.teamContactMasked", "Saved. A contact detail was removed from your team's info, deals happen through the platform, not directly."));
    else notify.success(t("dashboard.teamSaved"));
    setBusy(false);
  }

  return (
    <section id="sec-team" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
      <h2 style={sectionHeadStyle}>{t("dashboard.secTeam")}</h2>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginBottom: "14px" }}>
        {t("dashboard.teamHint")}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {rows.map((f, i) => (
          <div key={f.id ?? i} style={{ border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "14px", background: "var(--cr-paper-3)", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink-3)" }}>{t("dashboard.teamMemberN", { n: i + 1 })}</span>
              {rows.length > 1 && (
                <button type="button" onClick={() => remove(i)} aria-label={t("dashboard.repeaterRemove")}
                  style={{ background: "none", border: "none", color: "var(--cr-ink-4)", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}>×</button>
              )}
            </div>
            <div className="form-row-2" style={{ gap: "10px" }}>
              <Field label={t("onboarding.su.fullName")}><WarmInput value={f.name} onChange={(e) => update(i, "name", e.target.value)} /></Field>
              <Field label={t("onboarding.su.roleTitle")}><WarmInput value={f.role} onChange={(e) => update(i, "role", e.target.value)} placeholder="CEO & Co-founder" /></Field>
            </div>
            <Field label={t("dashboard.teamPrev")} hint={t("dashboard.teamPrevHint")}>
              <WarmInput value={f.prev} onChange={(e) => update(i, "prev", e.target.value)} placeholder="Ex-Stripe, Head of Growth" />
            </Field>
            <div className="form-row-2" style={{ gap: "10px" }}>
              <Field label={t("onboarding.su.linkedin")}><WarmInput value={f.linkedin_url} onChange={(e) => update(i, "linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/…" /></Field>
              <Field label={t("onboarding.su.twitterX")}><WarmInput value={f.twitter_url} onChange={(e) => update(i, "twitter_url", e.target.value)} placeholder="https://x.com/…" /></Field>
            </div>
            <Field label={t("dashboard.teamPhotoUrl")}><WarmInput value={f.photo_url} onChange={(e) => update(i, "photo_url", e.target.value)} placeholder="https://…" /></Field>
            <Field label={t("onboarding.su.shortBio")}><WarmTextarea value={f.bio} maxLength={500} onChange={(e) => update(i, "bio", e.target.value)} placeholder={t("onboarding.su.bioPh")} style={{ minHeight: 60 }} /></Field>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "14px" }}>
        <button type="button" onClick={add}
          style={{ border: "1px dashed var(--cr-rule-dark)", background: "transparent", color: "var(--cr-ink-3)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", padding: "8px 14px", cursor: "pointer" }}>
          + {t("dashboard.teamAddMember")}
        </button>
        <button type="button" onClick={save} disabled={busy}
          style={{ border: "1px solid var(--cr-copper-br)", background: "transparent", color: "var(--cr-copper)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", padding: "8px 16px", cursor: busy ? "wait" : "pointer" }}>
          {busy ? "…" : t("dashboard.teamSave")}
        </button>
        {saveState === "saved" && <Check style={{ width: 14, height: 14, color: "var(--cr-up)" }} />}
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EditStartupPage() {
  const { t } = useTranslation();
  const [startup, setStartup] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const router                = useRouter();
  const supabaseRef           = useRef(createClient());
  // get_my_startup() is `select * from startups where owner_id = ...` --
  // no join. Fetched alongside it so the completeness meter on THIS page
  // scores founders/documents/milestones the same way the founder dashboard
  // and admin pulse already do (both fetch the joined row); without this the
  // two surfaces can legitimately disagree about how finished a listing is,
  // which is exactly what listingCompleteness exists to make impossible.
  const [founders, setFounders] = useState<StartupFounder[]>([]);
  const [milestones, setMilestones] = useState<Array<{ id: string; date: string; description: string }>>([]);
  const [documentsCount, setDocumentsCount] = useState(0);
  const supabase              = supabaseRef.current;

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }
      // Column grants hide financials from the browser client since 109;
      // the owner's full row comes through the security-definer RPC, which
      // authorizes by auth.uid() and returns rows pre-ordered.
      const { data: ownRows } = await (supabase.rpc as CallableFunction)("get_my_startup");
      const data = (Array.isArray(ownRows) ? ownRows[0] : null) ?? null;
      if (data) {
        data.competitors_json = Array.isArray(data.competitors_json) ? data.competitors_json : [];
        // Migration 141 jsonb/array columns: null on every listing pre-dating
        // this pass (confirmed live on both real startups), and every
        // repeater below maps over its array unconditionally.
        data.key_metrics = Array.isArray(data.key_metrics) ? data.key_metrics : [];
        data.advisors = Array.isArray(data.advisors) ? data.advisors : [];
        data.hiring = Array.isArray(data.hiring) ? data.hiring : [];
        data.press = Array.isArray(data.press) ? data.press : [];
        data.awards = Array.isArray(data.awards) ? data.awards : [];
        data.use_of_funds_breakdown = Array.isArray(data.use_of_funds_breakdown) ? data.use_of_funds_breakdown : [];
        data.instruments_accepted = Array.isArray(data.instruments_accepted) ? data.instruments_accepted : [];
        data.product_screenshots = Array.isArray(data.product_screenshots) ? data.product_screenshots : [];
        // A client-only row id, so the customer-logo uploader has a stable
        // storage path per row -- never sent back (buildPayload strips it).
        data.customers = (Array.isArray(data.customers) ? data.customers : []).map((c: Record<string, unknown>) => ({
          _rid: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `c${Math.random().toString(36).slice(2)}`,
          name: "", logo_url: "", since: "", ...c,
        }));
      }
      // Founders, milestones and a document count -- RLS-scoped reads, the
      // same trust boundary onboarding and MilestonesSection already use for
      // these tables. Fetched once here rather than in each section, so the
      // completeness meter and the section below it read the same arrays.
      if (data) {
        const [{ data: fRows }, { data: mRows }, { count: dCount }] = await Promise.all([
          supabase.from("startup_founders").select("id, startup_id, name, role, prev, linkedin_url, twitter_url, photo_url, bio").eq("startup_id", data.id),
          supabase.from("startup_milestones").select("id, date, description").eq("startup_id", data.id).order("date", { ascending: false }),
          supabase.from("startup_documents").select("id", { count: "exact", head: true }).eq("startup_id", data.id),
        ]);
        setFounders((fRows ?? []) as unknown as StartupFounder[]);
        setMilestones(mRows ?? []);
        setDocumentsCount(dCount ?? 0);
      }
      // A local backup newer than the database (tab closed mid-edit) is
      // restored — the founder loses nothing.
      if (data) {
        try {
          const raw = localStorage.getItem(`cr_edit_backup_${data.id}`);
          if (raw) {
            const b = JSON.parse(raw);
            if (b?.at && b.startup && b.at > new Date(data.updated_at ?? 0).getTime()) {
              setStartup({ ...b.startup, id: data.id, status: data.status, updated_at: data.updated_at });
              dirty.current = true;
              setLoading(false);
              return;
            }
          }
        } catch { /* corrupt backup — ignore */ }
      }
      setStartup(data);
      setLoading(false);
    })();
  }, []);

  // A repeater row the founder opened but never filled (every text cell
  // still "") must not be saved -- the profile page renders whatever is in
  // the array, so an empty row would ship as a blank line no "hide
  // gracefully" check downstream can catch, because it is not missing, it is
  // present and empty.
  function nonEmptyRows<T extends Record<string, unknown>>(rows: T[] | null | undefined): T[] {
    return (rows || []).filter((r) => Object.values(r).some((v) => typeof v === "string" ? v.trim() : !!v));
  }

  // The column payload the form owns. Built once, used by both autosave and
  // the explicit Save so the two can never diverge.
  function buildPayload(st: any) {
    return {
      name: st.name, tagline: st.tagline, website: st.website || null,
      booking_url: st.booking_url || null,
      industry: st.industry, stage: st.stage, country: st.country,
      problem: st.problem, solution: st.solution, market: st.market,
      competitive_advantage: st.competitive_advantage,
      funding_target: parseInt(st.funding_target) || 0,
      equity_offered: parseFloat(st.equity_offered) || null,
      min_check_size: parseInt(st.min_check_size) || null,
      use_of_funds: st.use_of_funds || null,
      round_close_date: st.round_close_date || null,
      mrr: parseInt(st.mrr) || null, arr: parseInt(st.arr) || null,
      user_count: parseInt(st.user_count) || null,
      growth_rate: parseFloat(st.growth_rate) || null,
      demo_video_url: st.demo_video_url || null,
      require_nda: !!st.require_nda,
      founded_date: st.founded_date || null, city: st.city || null,
      business_model: st.business_model || null,
      revenue_model: st.revenue_model || null,
      team_size: st.team_size || null, company_type: st.company_type || null,
      churn_rate: parseFloat(st.churn_rate) || null,
      paying_customers: parseInt(st.paying_customers) || null,
      pitch_deck_url: st.pitch_deck_url || null,
      product_hunt_url: st.product_hunt_url || null,
      twitter_url: st.twitter_url || null,
      runway_months: parseInt(st.runway_months) || null,
      competitors_json:  st.competitors_json || [],
      target_markets:    st.target_markets || null,
      languages:         st.languages || null,
      previous_funding:  parseFloat(st.previous_funding) || null,
      lead_investor:     st.lead_investor || null,
      deck_language:     st.deck_language || null,
      video_pitch_url:   st.video_pitch_url || null,
      looking_for:       st.looking_for || null,
      tam: parseFloat(st.tam) || null, sam: parseFloat(st.sam) || null, som: parseFloat(st.som) || null,
      // D44: the round's own numbers.
      valuation: parseFloat(st.valuation) || null,
      valuation_type: st.valuation_type || null,
      instrument: st.instrument || null,
      safe_cap: parseFloat(st.safe_cap) || null,
      safe_discount: parseFloat(st.safe_discount) || null,
      // Migration 141 (rich profiles). why_now runs through the same
      // contact-detail masking as problem/solution/description -- see
      // LISTING_PROSE_FIELDS in lib/message-safety.
      why_now: st.why_now || null,
      key_metrics: nonEmptyRows(st.key_metrics),
      customers: nonEmptyRows((st.customers || []).map((c: any) => ({ name: c.name || undefined, logo_url: c.logo_url, since: c.since || undefined }))).filter((c: any) => c.logo_url),
      advisors: nonEmptyRows(st.advisors),
      hiring: nonEmptyRows(st.hiring),
      round_type: st.round_type || null,
      instruments_accepted: st.instruments_accepted || null,
      committed_amount: parseFloat(st.committed_amount) || null,
      // pct is typed numeric (types/index.ts, and the DonutChart consuming it
      // sums values arithmetically) but the row editor's number input hands
      // back a string -- cast here, once, rather than at every reader.
      use_of_funds_breakdown: nonEmptyRows(st.use_of_funds_breakdown).map((r: Record<string, unknown>) => ({ category: r.category, pct: parseFloat(String(r.pct)) || 0 })),
      press: nonEmptyRows(st.press),
      awards: nonEmptyRows(st.awards),
      product_screenshots: (st.product_screenshots || []).filter((u: string) => u && u.trim()),
      lead_investor_status: st.lead_investor_status || null,
    };
  }

  // Autosave: 1s after the last change, silently; "Saving… / Saved ✓" in
  // the header. localStorage keeps a copy on each change so a closed tab
  // loses nothing; it is restored on load if newer than the DB row.
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dirty = useRef(false);
  const lastSaved = useRef<string>("");
  // The last refusal shown as a toast. Autosave re-fires on every pause in
  // typing, so an unchanged refusal must not toast once a second.
  const lastErrorShown = useRef<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backupKey = startup?.id ? `cr_edit_backup_${startup.id}` : null;

  const persist = useCallback(async (st: any, opts: { retry?: boolean; explicit?: boolean } = {}): Promise<boolean> => {
    const payload = buildPayload(st);
    const sig = JSON.stringify(payload);
    if (sig === lastSaved.current) { setSaveState("saved"); return true; }
    setSaveState("saving");
    // Through the route, not the table: the pitch fields are masked for
    // contact details on the way in, and a live listing's edit is stamped for
    // admin re-check there rather than here.
    const res = await fetch("/api/startups/save", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: payload }),
    }).catch(() => null);
    if (res && !res.ok && res.status < 500) {
      // The route REFUSED this payload; the same bytes fail identically on a
      // resend, so no retry -- surface the reason the route crafted instead
      // (contact_in_prose names the field and the remedy, a tier-cap P0001
      // says which plan is needed). An explicit Save always toasts; autosave
      // only when the reason changed.
      const json = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
      const msg = typeof json?.error === "string" && json.error ? json.error : t("errors.generic");
      if (opts.explicit || msg !== lastErrorShown.current) notify.error(msg);
      lastErrorShown.current = msg;
      setSaveState("error");
      return false;
    }
    if (!res || !res.ok) {
      if (!opts.retry) return persist(st, { ...opts, retry: true });
      setSaveState("error");
      if (opts.explicit) notify.error(t("errors.generic"));
      return false;
    }
    const saved = await res.json().catch(() => ({}));
    lastSaved.current = sig;
    lastErrorShown.current = "";
    dirty.current = false;
    if (saved?.contactsWithheld?.length) {
      // The masked text goes back into the form. Without it the next autosave
      // re-sends the original and the founder is warned again every second,
      // while the box on screen shows something the listing does not.
      setStartup((s: any) => ({ ...s, ...saved.maskedFields }));
      notify.info(t("listingSafety.withheld"));
    }
    try { if (backupKey) localStorage.removeItem(backupKey); } catch { /* ignore */ }
    setSaveState("saved");
    setTimeout(() => setSaveState((v) => (v === "saved" ? "idle" : v)), 2000);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backupKey, t]);

  useEffect(() => {
    if (!startup || loading || !dirty.current) return;
    if (timer.current) clearTimeout(timer.current);
    try { if (backupKey) localStorage.setItem(backupKey, JSON.stringify({ at: Date.now(), startup })); } catch { /* quota */ }
    timer.current = setTimeout(() => { persist(startup); }, 1000);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startup]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    // persist owns the failure toasts on an explicit save: the route's own
    // reason for a refusal, the generic one for a network or server failure.
    const ok = await persist(startup, { explicit: true });
    if (ok) { notify.success(startup.status === "active" ? t("dashboard.editSavedLive") : t("dashboard.editSaved")); router.push("/dashboard/startup"); }
    setSaving(false);
  }

  function update(field: string, value: any) { dirty.current = true; setStartup((s: any) => ({ ...s, [field]: value })); }

  if (loading) return (
    <><Navbar />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <LedgerLoader />
      </div>
    </>
  );

  if (!startup) return (
    <><Navbar />
      <div style={{ textAlign: "center", padding: "80px 24px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)" }}>
        {t("dashboard.editNoStartup")} <Link href="/onboarding/startup" style={{ color: "var(--cr-copper)" }}>{t("dashboard.editCreateOne")} →</Link>
      </div>
    </>
  );

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "100vh", paddingBottom: "60px" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: "40px 24px" }}>

          {/* Back + Title */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
            <Link href="/dashboard/startup" style={{ display: "flex", alignItems: "center", gap: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", textDecoration: "none" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink)")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "var(--cr-ink-4)")}>
              <ArrowLeft style={{ width: 14, height: 14 }} /> {t("common.back")}
            </Link>
            <div style={{ width: 1, height: 14, background: "var(--cr-rule-dark)" }} />
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "24px", color: "var(--cr-ink)", letterSpacing: "-0.02em" }}>{t("dashboard.editProfile")}</h1>
            {/* Autosave indicator — right-aligned, only when something happens. */}
            <span aria-live="polite" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: saveState === "error" ? "var(--cr-down)" : "var(--cr-ink-4)", minHeight: 18 }}>
              {saveState === "saving" && (<><Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> {t("common.saving")}</>)}
              {saveState === "saved"  && (<><Check style={{ width: 12, height: 12, color: "var(--cr-up)" }} /> {t("dashboard.savedTick")}</>)}
              {/* Nothing retries on its own from here -- the next edit
                  re-arms the autosave -- so the label must not claim
                  otherwise. English fallback until the key lands. */}
              {saveState === "error"  && (t("dashboard.saveFailedEditToRetry") === "dashboard.saveFailedEditToRetry"
                ? "Save failed, edit to retry"
                : t("dashboard.saveFailedEditToRetry"))}
            </span>
          </div>

          {/* Status notice: a live listing stays live while you edit. */}
          {startup.status === "active" ? (
            <div style={{ background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.25)", borderRadius: "4px", padding: "12px 16px", marginBottom: "20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-up)" }}>
              {t("dashboard.editLiveNotice")}
            </div>
          ) : (
            <div style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(180,83,9,0.2)", borderRadius: "4px", padding: "12px 16px", marginBottom: "20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "#B45309" }}>
              {t("dashboard.editReviewNotice")}
            </div>
          )}

          {/* Section nav + completeness — sticky, so long forms stay navigable. */}
          {(() => {
            const sections: Array<[string, string]> = [
              ["sec-basics", t("dashboard.secCompanyBasics")], ["sec-team", t("dashboard.secTeam")],
              ["sec-model", t("onboarding.su.businessModel")],
              ["sec-pitch", t("onboarding.su.step3")], ["sec-traction", t("dashboard.secTraction")],
              ["sec-social-proof", t("dashboard.secSocialProof")],
              ["sec-raise", t("onboarding.su.step5")], ["sec-hiring", t("dashboard.secHiring")],
              ["sec-links", t("dashboard.secLinks")],
              ["sec-visibility", t("dashboard.secVisibility")], ["sec-settings", t("dashboard.settings")],
            ];
            // Same joined shape the founder dashboard and admin pulse score --
            // the fix for the edit page previously scoring founders/documents/
            // milestones as missing even when they exist (get_my_startup has
            // no join). Built here rather than merged into `startup` state so
            // buildPayload's outgoing patch never picks up these read-only
            // arrays.
            const { percent, items } = listingCompleteness({
              ...startup, founders, milestones,
              documents: Array.from({ length: documentsCount }),
            });
            const missing = items.filter((i) => !i.done).slice(0, 3);
            return (
              <div style={{ position: "sticky", top: "64px", zIndex: 20, background: "var(--cr-paper)", padding: "8px 0 10px", marginBottom: "16px", borderBottom: "1px solid var(--cr-rule)" }}>
                <div className="scrollbar-hide" style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "6px" }}>
                  {sections.map(([id, label]) => (
                    <a key={id} href={`#${id}`} style={{ flexShrink: 0, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "999px", padding: "5px 11px", textDecoration: "none", whiteSpace: "nowrap" }}>{label}</a>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
                  <div style={{ flex: 1, height: "4px", background: "var(--cr-paper-4)", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{ width: `${percent}%`, height: "100%", background: percent >= 70 ? "var(--cr-up)" : "var(--cr-copper)", transition: "width 400ms ease" }} />
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600, color: "var(--cr-ink-2)" }}>{percent}/100</span>
                  {missing.length > 0 && (
                    <span className="hidden md:inline" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)" }}>
                      · {missing.map((m) => `${t(m.labelKey)} (+${m.weight})`).join(" · ")}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* Company Basics */}
            <section id="sec-basics" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
              <h2 style={sectionHeadStyle}>{t("dashboard.secCompanyBasics")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* The logo saves immediately on upload (its own API), unlike
                    the text fields — an image in a form draft is a liability. */}
                <Field label={t("logo.fieldLabel")}>
                  <LogoUploader
                    entityType="startup"
                    name={startup.name || "?"}
                    logoUrl={(startup as { logo_url?: string | null }).logo_url ?? null}
                    logoColor={(startup as { logo_color?: string | null }).logo_color ?? null}
                    onChanged={(url, color) => { update("logo_url", url); update("logo_color", color); }}
                  />
                </Field>
                <Field label={t("onboarding.su.companyName")}><WarmInput value={startup.name || ""} onChange={e => update("name", e.target.value)} /></Field>
                <Field label={t("onboarding.su.tagline")}><WarmInput value={startup.tagline || ""} onChange={e => update("tagline", e.target.value)} /></Field>
                <Field label={t("onboarding.su.website")}><WarmInput value={startup.website || ""} onChange={e => update("website", e.target.value)} placeholder="https://…" /></Field>
                <Field label={t("settings.bookingUrl")}><WarmInput value={startup.booking_url || ""} onChange={e => update("booking_url", e.target.value)} placeholder="https://calendly.com/…" /></Field>
                <div className="form-row-2" style={{ gap: "14px" }}>
                  <Field label={t("onboarding.su.industry")}>
                    <WarmSelect value={startup.industry || ""} onChange={e => update("industry", e.target.value)}>
                      <option value="">{t("onboarding.su.selectIndustry")}</option>
                      {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                    </WarmSelect>
                  </Field>
                  <Field label={t("onboarding.su.stage")}>
                    <WarmSelect value={startup.stage || ""} onChange={e => update("stage", e.target.value)}>
                      <option value="">{t("onboarding.su.selectStage")}</option>
                      {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </WarmSelect>
                  </Field>
                </div>
                <div className="form-row-2" style={{ gap: "14px" }}>
                  <Field label={t("editor.roundCloseDate")}>
                    {/* Optional by design: rolling rounds have no date. The
                        listing shows a countdown inside 60 days and "closing
                        soon" once passed — see lib/round-close. */}
                    <WarmInput type="date" value={startup.round_close_date || ""}
                      onChange={e => update("round_close_date", e.target.value || null)} />
                  </Field>
                  <Field label={t("onboarding.su.country")}>
                    {/* See lib/countries: canonical spelling keeps the
                        Region facet and thesis-fit geography working. */}
                    <WarmInput list="cr-countries" value={startup.country || ""}
                      onChange={e => update("country", e.target.value)}
                      onBlur={() => update("country", normalizeCountry(startup.country))} />
                    <datalist id="cr-countries">
                      {COUNTRIES.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </Field>
                  <Field label={t("onboarding.su.city")}><WarmInput value={startup.city || ""} onChange={e => update("city", e.target.value)} placeholder="San Francisco" /></Field>
                </div>
                <div className="form-row-2" style={{ gap: "14px" }}>
                  <Field label={t("onboarding.su.foundedDate")}><WarmInput type="date" value={startup.founded_date || ""} onChange={e => update("founded_date", e.target.value)} /></Field>
                  <Field label={t("onboarding.su.companyType")}>
                    <WarmSelect value={startup.company_type || ""} onChange={e => update("company_type", e.target.value)}>
                      <option value="">{t("onboarding.su.selectType")}</option>
                      {COMPANY_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                    </WarmSelect>
                  </Field>
                </div>
                <div className="form-row-2" style={{ gap: "14px" }}>
                  <Field label={t("onboarding.su.teamSize")}>
                    <WarmSelect value={startup.team_size || ""} onChange={e => update("team_size", e.target.value)}>
                      <option value="">{t("onboarding.su.numEmployees")}</option>
                      {TEAM_SIZES.map(ts => <option key={ts} value={ts}>{ts}</option>)}
                    </WarmSelect>
                  </Field>
                  <Field label={t("onboarding.su.companyTwitter")}><WarmInput value={startup.twitter_url || ""} onChange={e => update("twitter_url", e.target.value)} placeholder="https://x.com/…" /></Field>
                </div>
              </div>
            </section>

            <FoundersSection
              startupId={startup.id}
              initial={founders.map((f) => ({
                id: f.id, name: f.name, role: f.role, prev: f.prev ?? "",
                linkedin_url: f.linkedin_url ?? "", twitter_url: f.twitter_url ?? "",
                photo_url: f.photo_url ?? "", bio: f.bio ?? "",
              }))}
              onSaved={setFounders}
            />

            {/* Business Model */}
            <section id="sec-model" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
              <h2 style={sectionHeadStyle}>{t("onboarding.su.businessModel")}</h2>
              <div className="form-row-2" style={{ gap: "14px" }}>
                <Field label={t("onboarding.su.businessModel")}>
                  <WarmSelect value={startup.business_model || ""} onChange={e => update("business_model", e.target.value)}>
                    <option value="">{t("dashboard.selectDots")}</option>
                    {BUSINESS_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                  </WarmSelect>
                </Field>
                <Field label={t("onboarding.su.revenueModel")}>
                  <WarmSelect value={startup.revenue_model || ""} onChange={e => update("revenue_model", e.target.value)}>
                    <option value="">{t("dashboard.selectDots")}</option>
                    {REVENUE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                  </WarmSelect>
                </Field>
              </div>
            </section>

            {/* Pitch */}
            <section id="sec-pitch" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
              <h2 style={sectionHeadStyle}>{t("onboarding.su.step3")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Field label={t("onboarding.su.problem")}><WarmTextarea value={startup.problem || ""} onChange={e => update("problem", e.target.value)} /></Field>
                <Field label={t("onboarding.su.solution")}><WarmTextarea value={startup.solution || ""} onChange={e => update("solution", e.target.value)} /></Field>
                <Field label={t("onboarding.su.targetMarket")}><WarmTextarea value={startup.market || ""} onChange={e => update("market", e.target.value)} /></Field>
                <Field label={t("onboarding.su.advantage")}><WarmTextarea value={startup.competitive_advantage || ""} onChange={e => update("competitive_advantage", e.target.value)} /></Field>
                <Field label={t("dashboard.whyNowLabel")} hint={t("dashboard.whyNowHint")}>
                  <WarmTextarea maxLength={600} value={startup.why_now || ""} onChange={e => update("why_now", e.target.value)} placeholder={t("dashboard.whyNowPh")} />
                </Field>
                <Field label={t("onboarding.su.competitors")} hint={t("dashboard.competitorsHintEnter")}>
                  <TagInput tags={startup.competitors_json || []} onChange={tags => update("competitors_json", tags)} placeholder={t("onboarding.su.competitorNamePh")} />
                </Field>
              
                <div className="form-row-2" style={{ gap: "14px" }}>
                  <Field label="TAM" hint={t("dashboard.tamHint")}><WarmInput type="number" min={0} value={startup.tam ?? ""} onChange={e => update("tam", e.target.value)} placeholder="2000000000" /></Field>
                  <Field label="SAM"><WarmInput type="number" min={0} value={startup.sam ?? ""} onChange={e => update("sam", e.target.value)} placeholder="400000000" /></Field>
                </div>
                <Field label="SOM"><WarmInput type="number" min={0} value={startup.som ?? ""} onChange={e => update("som", e.target.value)} placeholder="40000000" /></Field>
              </div>
            </section>

            {/* Traction & Metrics */}
            <section id="sec-traction" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
              <h2 style={sectionHeadStyle}>{t("dashboard.secTraction")}</h2>
              <div className="form-row-2" style={{ gap: "14px" }}>
                <Field label={t("onboarding.su.mrrUsd")}><WarmInput type="number" value={startup.mrr || ""} onChange={e => update("mrr", e.target.value)} /></Field>
                <Field label={t("onboarding.su.arrUsd")}><WarmInput type="number" value={startup.arr || ""} onChange={e => update("arr", e.target.value)} /></Field>
                <Field label={t("onboarding.su.totalUsers")}><WarmInput type="number" value={startup.user_count || ""} onChange={e => update("user_count", e.target.value)} /></Field>
                <Field label={t("onboarding.su.momGrowth")}><WarmInput type="number" value={startup.growth_rate || ""} onChange={e => update("growth_rate", e.target.value)} /></Field>
                <Field label={t("onboarding.su.payingCustomers")}><WarmInput type="number" value={startup.paying_customers || ""} onChange={e => update("paying_customers", e.target.value)} /></Field>
                <Field label={t("onboarding.su.churn")}><WarmInput type="number" step="0.1" value={startup.churn_rate || ""} onChange={e => update("churn_rate", e.target.value)} /></Field>
                <Field label={t("onboarding.su.runwayMonths")}><WarmInput type="number" value={startup.runway_months || ""} onChange={e => update("runway_months", e.target.value)} /></Field>
              </div>
              <div style={{ borderTop: "1px solid var(--cr-rule)", marginTop: "20px", paddingTop: "18px" }}>
                <Field label={t("dashboard.keyMetricsLabel")} hint={t("dashboard.keyMetricsHint")}>
                  <RepeaterField
                    rows={startup.key_metrics || []}
                    onChange={(rows) => update("key_metrics", rows)}
                    emptyRow={{ label: "", value: "", unit: "" }}
                    addLabel={t("dashboard.keyMetricAdd")}
                    removeLabel={t("dashboard.repeaterRemove")}
                    fields={[
                      { key: "label", placeholder: t("dashboard.keyMetricLabelPh"), basis: 140 },
                      { key: "value", placeholder: t("dashboard.keyMetricValuePh"), basis: 90 },
                      { key: "unit", placeholder: t("dashboard.keyMetricUnitPh"), basis: 70 },
                    ]}
                  />
                </Field>
              </div>
            </section>

            <MilestonesSection rows={milestones} setRows={setMilestones} />

            {/* Social proof: customers, advisors, press, awards. Each is its
                own optional block rather than one crowded section -- an
                investor scanning for validation looks for these as separate
                signals, not one paragraph. */}
            <section id="sec-social-proof" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
              <h2 style={sectionHeadStyle}>{t("dashboard.secSocialProof")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
                <Field label={t("dashboard.customersLabel")} hint={t("dashboard.customersHint")}>
                  <CustomerLogosField rows={startup.customers || []} onChange={(rows) => update("customers", rows)} />
                </Field>
                <Field label={t("dashboard.advisorsLabel")} hint={t("dashboard.advisorsHint")}>
                  <RepeaterField
                    rows={startup.advisors || []}
                    onChange={(rows) => update("advisors", rows)}
                    emptyRow={{ name: "", role: "", linkedin: "" }}
                    addLabel={t("dashboard.advisorAdd")}
                    removeLabel={t("dashboard.repeaterRemove")}
                    fields={[
                      { key: "name", placeholder: t("dashboard.advisorNamePh"), basis: 130 },
                      { key: "role", placeholder: t("dashboard.advisorRolePh"), basis: 130 },
                      { key: "linkedin", placeholder: "https://linkedin.com/in/…", basis: 160 },
                    ]}
                  />
                </Field>
                <Field label={t("dashboard.pressLabel")} hint={t("dashboard.pressHint")}>
                  <RepeaterField
                    rows={startup.press || []}
                    onChange={(rows) => update("press", rows)}
                    emptyRow={{ outlet: "", title: "", url: "", date: "" }}
                    addLabel={t("dashboard.pressAdd")}
                    removeLabel={t("dashboard.repeaterRemove")}
                    fields={[
                      { key: "outlet", placeholder: t("dashboard.pressOutletPh"), basis: 110 },
                      { key: "title", placeholder: t("dashboard.pressTitlePh"), basis: 160 },
                      { key: "url", placeholder: "https://…", basis: 140 },
                      { key: "date", placeholder: "", type: "date", basis: 130 },
                    ]}
                  />
                </Field>
                <Field label={t("dashboard.awardsLabel")} hint={t("dashboard.awardsHint")}>
                  <RepeaterField
                    rows={startup.awards || []}
                    onChange={(rows) => update("awards", rows)}
                    emptyRow={{ name: "", year: "" }}
                    addLabel={t("dashboard.awardAdd")}
                    removeLabel={t("dashboard.repeaterRemove")}
                    fields={[
                      { key: "name", placeholder: t("dashboard.awardNamePh"), basis: 180 },
                      { key: "year", placeholder: "2025", basis: 70 },
                    ]}
                  />
                </Field>
              </div>
            </section>

            {/* The Ask */}
            <section id="sec-raise" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
              <h2 style={sectionHeadStyle}>{t("onboarding.su.step5")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div className="form-row-2" style={{ gap: "14px" }}>
                  <Field label={t("onboarding.su.fundingTarget")}><WarmInput type="number" value={startup.funding_target || ""} onChange={e => update("funding_target", e.target.value)} /></Field>
                  <Field label={t("dashboard.roundTypeLabel")} hint={t("dashboard.roundTypeHint")}>
                    <WarmInput value={startup.round_type || ""} onChange={e => update("round_type", e.target.value)} placeholder="Seed extension" />
                  </Field>
                </div>
                <Field label={t("dashboard.committedAmountLabel")} hint={t("dashboard.committedAmountHint")}>
                  <WarmInput type="number" min={0} value={startup.committed_amount ?? ""} onChange={e => update("committed_amount", e.target.value)} placeholder="0" />
                </Field>
                <Field label={t("dashboard.instrumentsAcceptedLabel")} hint={t("dashboard.instrumentsAcceptedHint")}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {INSTRUMENT_OPTIONS.map(opt => (
                      <button key={opt} type="button"
                        onClick={() => {
                          const cur: string[] = startup.instruments_accepted || [];
                          update("instruments_accepted", cur.includes(opt) ? cur.filter((x: string) => x !== opt) : [...cur, opt]);
                        }}
                        style={{
                          fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
                          padding: "6px 14px", borderRadius: "3px", cursor: "pointer",
                          border: (startup.instruments_accepted || []).includes(opt) ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule)",
                          background: (startup.instruments_accepted || []).includes(opt) ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
                          color: (startup.instruments_accepted || []).includes(opt) ? "var(--cr-copper)" : "var(--cr-ink-3)",
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label={t("onboarding.su.equityOffered")}><WarmInput type="number" step="0.1" value={startup.equity_offered || ""} onChange={e => update("equity_offered", e.target.value)} /></Field>
                <Field label={t("onboarding.su.minCheckSize")}><WarmInput type="number" value={startup.min_check_size || ""} onChange={e => update("min_check_size", e.target.value)} /></Field>
                <Field label={t("onboarding.su.useOfFunds")}><WarmTextarea value={startup.use_of_funds || ""} onChange={e => update("use_of_funds", e.target.value)} /></Field>
                {(() => {
                  const rows: Array<{ category: string; pct: string }> = startup.use_of_funds_breakdown || [];
                  const total = rows.reduce((s, r) => s + (parseFloat(r.pct) || 0), 0);
                  const complete = rows.length > 0 && total === 100;
                  return (
                    <Field label={t("dashboard.useOfFundsBreakdownLabel")} hint={t("dashboard.useOfFundsBreakdownHint")}>
                      <RepeaterField
                        rows={rows}
                        onChange={(next) => update("use_of_funds_breakdown", next)}
                        emptyRow={{ category: "", pct: "" }}
                        addLabel={t("dashboard.useOfFundsBreakdownAdd")}
                        removeLabel={t("dashboard.repeaterRemove")}
                        fields={[
                          { key: "category", placeholder: t("dashboard.useOfFundsCategoryPh"), basis: 160 },
                          { key: "pct", placeholder: "%", type: "number", basis: 70 },
                        ]}
                      />
                      {rows.length > 0 && (
                        <p style={{ marginTop: "8px", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: 600, color: complete ? "var(--cr-up)" : "var(--cr-down)" }}>
                          {t("dashboard.useOfFundsBreakdownTotal", { pct: total })}{!complete && `, ${t("dashboard.useOfFundsBreakdownMustSum100")}`}
                        </p>
                      )}
                    </Field>
                  );
                })()}

                {/* D44: valuation, so investors do not have to reverse-engineer
                    it from the equity number (and so the two can be checked). */}
                <div className="form-row-2" style={{ gap: "14px" }}>
                  <Field label={t("round.valuation")} hint={t("round.valuationHint")}>
                    <WarmInput type="number" min={0} value={startup.valuation ?? ""} onChange={e => update("valuation", e.target.value)} placeholder="4500000" />
                  </Field>
                  <Field label={t("round.valuationType")} termKey="glossary.preMoney">
                    <WarmSelect value={startup.valuation_type || ""} onChange={e => update("valuation_type", e.target.value)}>
                      <option value="">—</option>
                      <option value="pre">{t("round.pre")}</option>
                      <option value="post">{t("round.post")}</option>
                    </WarmSelect>
                  </Field>
                </div>
                <Field label={t("round.instrument")} termKey="glossary.safe">
                  <WarmSelect value={startup.instrument || ""} onChange={e => update("instrument", e.target.value)}>
                    <option value="">—</option>
                    <option value="equity">{t("round.equity")}</option>
                    <option value="safe">{t("round.safe")}</option>
                    <option value="convertible_note">{t("round.note")}</option>
                  </WarmSelect>
                </Field>
                {(startup.instrument === "safe" || startup.instrument === "convertible_note") && (
                  <div className="form-row-2" style={{ gap: "14px" }}>
                    <Field label={t("round.cap")} termKey="glossary.safe"><WarmInput type="number" min={0} value={startup.safe_cap ?? ""} onChange={e => update("safe_cap", e.target.value)} placeholder="6000000" /></Field>
                    <Field label={t("round.discount")}><WarmInput type="number" min={0} max={99} value={startup.safe_discount ?? ""} onChange={e => update("safe_discount", e.target.value)} placeholder="20" /></Field>
                  </div>
                )}
              </div>
            </section>

            {/* Links & Assets */}
            <section id="sec-links" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
              <h2 style={sectionHeadStyle}>{t("dashboard.secLinks")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Field label={t("onboarding.su.pitchDeckUrl")} hint={t("dashboard.pitchDeckHint2")}>
                  <WarmInput value={startup.pitch_deck_url || ""} onChange={e => update("pitch_deck_url", e.target.value)} placeholder="https://docsend.com/…" />
                </Field>
                <Field label={t("dashboard.pitchVideoUrl")} hint={t("dashboard.pitchVideoHint")}>
                  <WarmInput value={startup.video_pitch_url || ""} onChange={e => update("video_pitch_url", e.target.value)} placeholder="https://youtube.com/watch?v=… or loom.com/share/…" />
                </Field>
                <Field label={t("onboarding.su.demoVideoUrl")}>
                  {/* Paid feature (Growth): the listing only renders the video
                      on Growth, so an un-gated input here was a field that
                      silently did nothing on lower plans. */}
                  {startup.subscription_tier === "growth" ? (
                    <WarmInput value={startup.demo_video_url || ""} onChange={e => update("demo_video_url", e.target.value)} placeholder="https://youtube.com/watch?v=…" />
                  ) : (
                    <p className="text-xs text-cr-i4">
                      {t("invSettings.videoPaid")}{" "}
                      <Link href="/pricing" className="text-cr-copper underline underline-offset-2">{t("common.upgrade")}</Link>
                    </p>
                  )}
                </Field>
                <Field label={t("onboarding.su.productHuntUrl")}>
                  <WarmInput value={startup.product_hunt_url || ""} onChange={e => update("product_hunt_url", e.target.value)} placeholder="https://producthunt.com/posts/…" />
                </Field>
                <Field label={t("dashboard.screenshotsLabel")} hint={t("dashboard.screenshotsHint")}>
                  <TagInput tags={startup.product_screenshots || []} onChange={urls => update("product_screenshots", urls)} placeholder="https://…" />
                </Field>
              </div>
            </section>

            {/* Hiring */}
            <section id="sec-hiring" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
              <h2 style={sectionHeadStyle}>{t("dashboard.secHiring")}</h2>
              <Field label={t("dashboard.hiringLabel")} hint={t("dashboard.hiringHint")}>
                <RepeaterField
                  rows={startup.hiring || []}
                  onChange={(rows) => update("hiring", rows)}
                  emptyRow={{ role: "", location: "" }}
                  addLabel={t("dashboard.hiringAdd")}
                  removeLabel={t("dashboard.repeaterRemove")}
                  fields={[
                    { key: "role", placeholder: t("dashboard.hiringRolePh"), basis: 160 },
                    { key: "location", placeholder: t("dashboard.hiringLocationPh"), basis: 130 },
                  ]}
                />
              </Field>
            </section>

            {/* Visibility & Outreach */}
            <section id="sec-visibility" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
              <h2 style={sectionHeadStyle}>{t("dashboard.secVisibility")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Field label={t("dashboard.lookingFor")} hint={t("dashboard.lookingForHint")}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {LOOKING_FOR_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => {
                          const cur: string[] = startup.looking_for || [];
                          update("looking_for", cur.includes(opt.value) ? cur.filter((x: string) => x !== opt.value) : [...cur, opt.value]);
                        }}
                        style={{
                          fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
                          padding: "6px 14px", borderRadius: "3px", cursor: "pointer",
                          border: (startup.looking_for || []).includes(opt.value) ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule)",
                          background: (startup.looking_for || []).includes(opt.value) ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
                          color: (startup.looking_for || []).includes(opt.value) ? "var(--cr-copper)" : "var(--cr-ink-3)",
                        }}
                      >
                        {t(opt.labelKey)}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label={t("dashboard.targetMarketsLabel")} hint={t("dashboard.targetMarketsHint")}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {TARGET_MARKET_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => {
                          const cur: string[] = startup.target_markets || [];
                          update("target_markets", cur.includes(opt.value) ? cur.filter((x: string) => x !== opt.value) : [...cur, opt.value]);
                        }}
                        style={{
                          fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
                          padding: "6px 14px", borderRadius: "3px", cursor: "pointer",
                          border: (startup.target_markets || []).includes(opt.value) ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule)",
                          background: (startup.target_markets || []).includes(opt.value) ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
                          color: (startup.target_markets || []).includes(opt.value) ? "var(--cr-copper)" : "var(--cr-ink-3)",
                        }}
                      >
                        {t(opt.labelKey)}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label={t("dashboard.deckLanguage")}>
                  <WarmSelect value={startup.deck_language || ""} onChange={e => update("deck_language", e.target.value)}>
                    <option value="">{t("dashboard.selectDots")}</option>
                    {DECK_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                  </WarmSelect>
                </Field>
                <div className="form-row-2" style={{ gap: "14px" }}>
                  <Field label={t("dashboard.leadInvestor")} hint={t("dashboard.leadInvestorHint")}>
                    <WarmInput value={startup.lead_investor || ""} onChange={e => update("lead_investor", e.target.value)} placeholder="e.g. Sequoia Capital" />
                  </Field>
                  <Field label={t("dashboard.prevFunding")} hint={t("dashboard.prevFundingHint")}>
                    <WarmInput type="number" value={startup.previous_funding || ""} onChange={e => update("previous_funding", e.target.value)} placeholder="0" />
                  </Field>
                </div>
                <Field label={t("dashboard.leadStatusLabel")} hint={t("dashboard.leadStatusHint")}>
                  <WarmSelect value={startup.lead_investor_status || ""} onChange={e => update("lead_investor_status", e.target.value)}>
                    <option value="">{t("dashboard.selectDots")}</option>
                    {LEAD_STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>)}
                  </WarmSelect>
                </Field>
                <Field label={t("dashboard.teamLanguages")} hint={t("dashboard.teamLanguagesHint")}>
                  <TagInput tags={startup.languages || []} onChange={tags => update("languages", tags)} placeholder="English, German, French…" />
                </Field>
              </div>
            </section>

            {/* Settings */}
            <section id="sec-settings" style={{ ...sectionStyle, scrollMarginTop: "150px" }}>
              <h2 style={sectionHeadStyle}>{t("dashboard.settings")}</h2>
              <WarmToggle
                checked={!!startup.require_nda}
                onChange={v => update("require_nda", v)}
                label={t("dashboard.ndaToggle")}
                hint={t("dashboard.ndaToggleHint")}
              />
            </section>

            {/* Submit */}
            <button type="submit" disabled={saving}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", height: "48px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
              <Save style={{ width: 16, height: 16 }} />
              {saving ? t("common.saving") : t("dashboard.saveAll")}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
