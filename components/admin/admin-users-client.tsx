"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { notify } from "@/components/ui/toast-notify";
import { formatDate } from "@/lib/utils";

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  subscription_tier: string | null;
  account_status: string | null;
  suspended: boolean | null;
  suspended_reason: string | null;
  suspended_at: string | null;
  suspended_until: string | null;
  created_at: string;
}

const TABS = ["all", "startup", "investor", "suspended", "admin"] as const;
type Tab = typeof TABS[number];

const TAB_LABEL: Record<Tab, string> = {
  all: "All", startup: "Startups", investor: "Investors",
  suspended: "Suspended", admin: "Admins",
};

const DURATIONS = [
  { value: "1d",         label: "1 day" },
  { value: "7d",         label: "7 days" },
  { value: "30d",        label: "30 days" },
  { value: "indefinite", label: "Indefinite" },
];

const CONFIRM_PHRASE = "SUSPEND ALL";

function statusStyle(status: string): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
    borderRadius: "3px", padding: "3px 8px", textTransform: "uppercase",
    letterSpacing: "0.05em", whiteSpace: "nowrap",
  };
  if (status === "suspended") return { ...base, background: "var(--cr-down-bg)", color: "var(--cr-down)", border: "1px solid rgba(180,50,50,0.2)" };
  if (status === "banned")    return { ...base, background: "var(--cr-paper-3)", color: "var(--cr-ink)", border: "1px solid var(--cr-rule-dark)" };
  if (status === "pending")   return { ...base, background: "var(--cr-copper-bg)", color: "var(--cr-copper)", border: "1px solid var(--cr-copper-br)" };
  return { ...base, background: "var(--cr-up-bg)", color: "var(--cr-up)", border: "1px solid rgba(45,106,79,0.25)" };
}

const cellStyle: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px",
  color: "var(--cr-ink-3)", padding: "12px 10px", borderBottom: "1px solid var(--cr-rule)",
  verticalAlign: "middle",
};

const linkBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px",
  textDecoration: "underline", padding: 0,
};

export function AdminUsersClient({ users, currentAdminId }: { users: AdminUser[]; currentAdminId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Suspend modal
  const [target, setTarget] = useState<AdminUser | null>(null);
  // Tier editor: which user, and the tier chosen in the modal.
  const [tierTarget, setTierTarget] = useState<AdminUser | null>(null);
  const [tierChoice, setTierChoice] = useState("free");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("indefinite");

  // Danger zone
  const [bulkStep, setBulkStep] = useState<0 | 1 | 2>(0);
  const [bulkPhrase, setBulkPhrase] = useState("");
  const [bulkReason, setBulkReason] = useState("");

  function isSuspended(u: AdminUser) {
    return !!u.suspended || u.account_status === "suspended" || u.account_status === "banned";
  }

  const filtered = useMemo(() => {
    let list = users;
    if (tab === "suspended")      list = list.filter(isSuspended);
    else if (tab !== "all")       list = list.filter(u => u.role === tab);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(u =>
        u.email.toLowerCase().includes(q) || (u.full_name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [users, tab, search]);

  const counts = useMemo(() => ({
    all: users.length,
    startup: users.filter(u => u.role === "startup").length,
    investor: users.filter(u => u.role === "investor").length,
    suspended: users.filter(isSuspended).length,
    admin: users.filter(u => u.role === "admin").length,
  }), [users]);

  async function suspend() {
    if (!target || !reason.trim()) return;
    setBusy(target.id);
    let res: Response | null = null, data: { error?: string } = {};
    try {
      res = await fetch("/api/admin/suspend", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: target.id, reason: reason.trim(), duration }),
      });
      data = await res.json().catch(() => ({}));
    } finally { setBusy(null); }
    if (!res?.ok) { notify.error(data.error || "Failed to suspend"); return; }
    notify.success(`${target.full_name || target.email} suspended`);
    setTarget(null); setReason(""); setDuration("indefinite");
    router.refresh();
  }

  async function applyTier() {
    if (!tierTarget) return;
    setBusy(tierTarget.id);
    let res: Response | null = null, data: { error?: string } = {};
    try {
      res = await fetch("/api/admin/set-tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: tierTarget.id, tier: tierChoice }),
      });
      data = await res.json().catch(() => ({}));
    } finally { setBusy(null); }
    if (!res?.ok) { notify.error(data.error || "Failed to set tier"); return; }
    notify.success("Tier updated");
    setTierTarget(null);
    router.refresh();
  }

  async function unsuspend(u: AdminUser) {
    setBusy(u.id);
    let res: Response | null = null, data: { error?: string } = {};
    try {
      res = await fetch("/api/admin/unsuspend", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id }),
      });
      data = await res.json().catch(() => ({}));
    } finally { setBusy(null); }
    if (!res?.ok) { notify.error(data.error || "Failed to restore"); return; }
    notify.success(`${u.full_name || u.email} restored`);
    router.refresh();
  }

  async function bulk(action: "suspend" | "unsuspend") {
    setBusy("bulk");
    let res: Response | null = null, data: { error?: string; suspended?: number; restored?: number } = {};
    try {
      res = await fetch("/api/admin/suspend-all", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          confirm: action === "suspend" ? bulkPhrase : undefined,
          reason: bulkReason.trim() || undefined,
        }),
      });
      data = await res.json().catch(() => ({}));
    } finally { setBusy(null); }
    if (!res?.ok) { notify.error(data.error || "Bulk action failed"); return; }
    notify.success(action === "suspend"
      ? `${data.suspended} accounts suspended`
      : `${data.restored} accounts restored`);
    setBulkStep(0); setBulkPhrase(""); setBulkReason("");
    router.refresh();
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", marginBottom: "20px" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: tab === t ? "var(--cr-ink)" : "var(--cr-paper-2)",
              border: `1px solid ${tab === t ? "var(--cr-ink)" : "var(--cr-rule-dark)"}`,
              borderRadius: "14px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
              fontSize: "12px", color: tab === t ? "var(--cr-paper)" : "var(--cr-ink-3)",
              padding: "6px 13px", cursor: "pointer",
            }}>
            {TAB_LABEL[t]} ({counts[t]})
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name or email…"
          style={{
            background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
            borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px",
            color: "var(--cr-ink)", padding: "8px 10px", outline: "none", width: "220px",
          }} />
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", border: "1px solid var(--cr-rule-dark)", borderRadius: "6px", background: "var(--cr-paper-2)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "780px" }}>
          <thead>
            <tr>
              {["User", "Role", "Plan", "Joined", "Status", "Actions"].map(h => (
                <th key={h} style={{
                  textAlign: "left", fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                  fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase",
                  letterSpacing: "0.06em", padding: "10px", borderBottom: "1px solid var(--cr-rule-dark)",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ ...cellStyle, textAlign: "center", padding: "32px" }}>No users match.</td></tr>
            )}
            {filtered.map(u => {
              const suspended = isSuspended(u);
              const self = u.id === currentAdminId;
              return (
                <tr key={u.id}>
                  <td style={cellStyle}>
                    <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>
                      {u.full_name || "—"}{self && " (you)"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--cr-ink-4)" }}>{u.email}</div>
                  </td>
                  <td style={{ ...cellStyle, textTransform: "capitalize" }}>{u.role}</td>
                  <td style={{ ...cellStyle, textTransform: "capitalize" }}>
                    {u.role === "admin" ? (
                      u.subscription_tier || "free"
                    ) : (
                      <button
                        onClick={() => { setTierTarget(u); setTierChoice(u.subscription_tier || "free"); }}
                        title="Change tier"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", textTransform: "capitalize", color: "var(--cr-copper)", textDecoration: "underline dotted" }}
                      >
                        {u.subscription_tier || "free"}
                      </button>
                    )}
                  </td>
                  <td style={{ ...cellStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: "11px" }}>{formatDate(u.created_at)}</td>
                  <td style={cellStyle}>
                    <span style={statusStyle(u.account_status || "active")}>
                      {u.account_status || "active"}
                    </span>
                    {u.suspended_reason && (
                      <div style={{ fontSize: "10px", color: "var(--cr-ink-4)", marginTop: "3px", maxWidth: "180px" }}>
                        {u.suspended_reason}
                      </div>
                    )}
                  </td>
                  <td style={cellStyle}>
                    {u.role === "admin" || self ? (
                      <span style={{ fontSize: "11px", color: "var(--cr-ink-4)" }}>Protected</span>
                    ) : suspended ? (
                      <button onClick={() => unsuspend(u)} disabled={busy === u.id}
                        style={{ ...linkBtn, color: "var(--cr-up)", opacity: busy === u.id ? 0.5 : 1 }}>
                        {busy === u.id ? "Restoring…" : "Unsuspend"}
                      </button>
                    ) : (
                      <button onClick={() => { setTarget(u); setReason(""); setDuration("indefinite"); }}
                        style={{ ...linkBtn, color: "var(--cr-down)" }}>
                        Suspend
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Danger zone */}
      <div style={{
        background: "var(--cr-down-bg)", border: "1px solid rgba(180,50,50,0.15)",
        borderRadius: "8px", padding: "24px", marginTop: "48px",
      }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-down)" }}>
          Danger zone
        </p>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", marginTop: "6px", lineHeight: 1.6 }}>
          Suspends every non-admin account and signs them out immediately. Admin accounts are
          never affected, so you keep access to reverse it. No emails are sent — the suspension
          page explains the situation instead.
        </p>
        <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
          <button onClick={() => setBulkStep(1)} disabled={busy === "bulk"}
            style={{
              background: "var(--cr-down)", border: "none", borderRadius: "4px",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
              color: "#fff", padding: "10px 20px", cursor: "pointer",
            }}>
            Suspend all users
          </button>
          <button onClick={() => bulk("unsuspend")} disabled={busy === "bulk"}
            style={{
              background: "transparent", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px",
              color: "var(--cr-ink-3)", padding: "10px 20px", cursor: "pointer",
            }}>
            {busy === "bulk" ? "Working…" : "Unsuspend all"}
          </button>
        </div>
      </div>

      {/* Suspend modal */}
      {tierTarget && (
        <Modal onClose={() => setTierTarget(null)} title={`Set tier for ${tierTarget.full_name || tierTarget.email}`}>
          <p style={{ fontSize: "12px", color: "var(--cr-ink-3)", marginBottom: "12px" }}>
            Applies immediately and notifies the user. Role: <b style={{ textTransform: "capitalize" }}>{tierTarget.role}</b>
          </p>
          <select
            value={tierChoice}
            onChange={e => setTierChoice(e.target.value)}
            style={{ width: "100%", height: "38px", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "0 10px", marginBottom: "16px", background: "var(--cr-paper-3)", fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink)" }}
          >
            {(tierTarget.role === "startup"
              ? ["free", "starter", "growth"]
              : ["free", "angel", "pro", "institution"]
            ).map(t2 => <option key={t2} value={t2} style={{ textTransform: "capitalize" }}>{t2}</option>)}
          </select>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button onClick={() => setTierTarget(null)} style={ghostBtn}>Cancel</button>
            <button onClick={applyTier} disabled={busy === tierTarget.id}
              style={{ background: "var(--cr-copper)", color: "#fff", border: "none", borderRadius: "4px", padding: "8px 16px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", cursor: "pointer", opacity: busy === tierTarget.id ? 0.5 : 1 }}>
              {busy === tierTarget.id ? "Saving…" : "Apply tier"}
            </button>
          </div>
        </Modal>
      )}

      {target && (
        <Modal onClose={() => setTarget(null)} title={`Suspend ${target.full_name || target.email}?`}>
          <label style={labelStyle}>Reason (shown to the user)</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus
            placeholder="Explain why this account is being suspended…"
            style={{ ...inputStyle, resize: "vertical" }} />
          <label style={{ ...labelStyle, marginTop: "12px" }}>Duration</label>
          <select value={duration} onChange={e => setDuration(e.target.value)} style={inputStyle}>
            {DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
            <button onClick={suspend} disabled={!reason.trim() || busy === target.id}
              style={{
                flex: 1, height: "38px", background: "var(--cr-down)", border: "none", borderRadius: "4px",
                fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff",
                cursor: !reason.trim() ? "default" : "pointer", opacity: !reason.trim() ? 0.5 : 1,
              }}>
              {busy === target.id ? "Suspending…" : "Suspend account"}
            </button>
            <button onClick={() => setTarget(null)} style={ghostBtn}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* Bulk confirm — step 1: type the phrase */}
      {bulkStep === 1 && (
        <Modal onClose={() => { setBulkStep(0); setBulkPhrase(""); }} title="Suspend all users?">
          <p style={modalTextStyle}>
            This suspends every non-admin account on the platform and signs those users out.
            Type <strong>{CONFIRM_PHRASE}</strong> to continue.
          </p>
          <input type="text" value={bulkPhrase} onChange={e => setBulkPhrase(e.target.value)} autoFocus
            placeholder={CONFIRM_PHRASE} style={{ ...inputStyle, marginTop: "12px" }} />
          <label style={{ ...labelStyle, marginTop: "12px" }}>Reason shown to users (optional)</label>
          <input type="text" value={bulkReason} onChange={e => setBulkReason(e.target.value)}
            placeholder="Platform temporarily unavailable…" style={inputStyle} />
          <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
            <button onClick={() => setBulkStep(2)} disabled={bulkPhrase !== CONFIRM_PHRASE}
              style={{
                flex: 1, height: "38px", background: "var(--cr-down)", border: "none", borderRadius: "4px",
                fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff",
                cursor: bulkPhrase !== CONFIRM_PHRASE ? "default" : "pointer",
                opacity: bulkPhrase !== CONFIRM_PHRASE ? 0.5 : 1,
              }}>
              Continue
            </button>
            <button onClick={() => { setBulkStep(0); setBulkPhrase(""); }} style={ghostBtn}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* Bulk confirm — step 2 */}
      {bulkStep === 2 && (
        <Modal onClose={() => setBulkStep(0)} title="Final confirmation">
          <p style={modalTextStyle}>
            All non-admin users will lose access immediately and their sessions will be revoked.
            You can reverse this with &ldquo;Unsuspend all&rdquo;.
          </p>
          <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
            <button onClick={() => bulk("suspend")} disabled={busy === "bulk"}
              style={{
                flex: 1, height: "38px", background: "var(--cr-down)", border: "none", borderRadius: "4px",
                fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff",
                cursor: "pointer", opacity: busy === "bulk" ? 0.6 : 1,
              }}>
              {busy === "bulk" ? "Suspending…" : "Suspend all users"}
            </button>
            <button onClick={() => setBulkStep(0)} style={ghostBtn}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Shared modal shell ────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  // Clicking the backdrop closed this, but nothing on the keyboard did. A
  // dialog that can only be dismissed with a mouse traps anyone navigating by
  // keyboard -- and Escape is what everyone reaches for first regardless.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(26,22,18,0.4)", zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)",
          borderRadius: "8px", width: "100%", maxWidth: "460px", padding: "28px",
        }}>
        <p style={{
          fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "16px",
          color: "var(--cr-ink)", marginBottom: "16px",
        }}>{title}</p>
        {children}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px",
};

const inputStyle: React.CSSProperties = {
  width: "100%", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
  borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontSize: "13px",
  color: "var(--cr-ink)", padding: "9px 11px", outline: "none", boxSizing: "border-box",
};

const ghostBtn: React.CSSProperties = {
  height: "38px", padding: "0 18px", background: "transparent",
  border: "1px solid var(--cr-rule-dark)", borderRadius: "4px",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px",
  color: "var(--cr-ink-3)", cursor: "pointer",
};

const modalTextStyle: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px",
  color: "var(--cr-ink-3)", lineHeight: 1.65,
};
