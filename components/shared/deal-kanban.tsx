"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";
import { formatMoney, CURRENCIES, getCurrency, DEFAULT_CURRENCY } from "@/lib/currency";
import { X, CheckCircle2, TrendingUp, Lock, Plus, FileText, ChevronDown, Loader2 } from "lucide-react";
import { notify } from "@/components/ui/toast-notify";
import type { Deal, DealStatus, Contract, ContractType } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

const CONTRACT_TYPES: ContractType[] = ["term_sheet", "safe", "convertible_note", "nda", "custom"];
const CONTRACT_TYPE_KEY: Record<ContractType, string> = {
  term_sheet:       "deals.contractTypeTermSheet",
  safe:              "deals.contractTypeSafe",
  convertible_note:  "deals.contractTypeNote",
  nda:               "deals.contractTypeNda",
  custom:            "deals.contractTypeCustom",
};

// ── Column config ─────────────────────────────────────────────────────────────

function useColumns(): { status: DealStatus; label: string; copperActive: boolean }[] {
  const { t } = useTranslation();
  return [
    { status: "intro",          label: t("deals.colIntro"),        copperActive: false },
    { status: "due_diligence",  label: t("dashboard.dueDiligence"), copperActive: false },
    { status: "term_sheet",     label: t("deals.colTermSheet"),     copperActive: true  },
    { status: "closed",         label: t("deals.colClosed"),        copperActive: false },
    { status: "passed",         label: t("deals.colPassed"),        copperActive: false },
  ];
}

const QUICK_MOVE: DealStatus[] = ["due_diligence", "term_sheet", "passed"];

interface DealKanbanProps {
  deals: Deal[];
  onStatusChange?: (dealId: string, status: DealStatus) => void;
  onDealClose?: (dealId: string, amount: number, currency: string) => void;
  viewAs: "startup" | "investor" | "admin";
  // When false and viewAs === "startup", the investor's identity is masked
  // behind an upgrade prompt (Free founders don't see who's interested).
  revealIdentity?: boolean;
}

// ── Column header badge ───────────────────────────────────────────────────────

function colBadgeStyle(status: DealStatus, count: number): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
    borderRadius: "3px", padding: "3px 8px", textTransform: "uppercase",
    letterSpacing: "0.06em", display: "inline-block",
  };
  if (status === "closed") return { ...base, background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.25)", color: "var(--cr-up)" };
  if (status === "passed") return { ...base, background: "var(--cr-down-bg)", border: "1px solid rgba(180,50,50,0.2)", color: "var(--cr-down)" };
  if (status === "term_sheet") return { ...base, background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)" };
  return { ...base, background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", color: "var(--cr-ink-3)" };
}

// ── Empty column placeholder ──────────────────────────────────────────────────

function EmptySlot() {
  const { t } = useTranslation();
  return (
    <div style={{ border: "1px dashed var(--cr-rule-dark)", borderRadius: "4px", padding: "20px 12px", textAlign: "center" }}>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>{t("deals.noDealsCol")}</p>
    </div>
  );
}

// ── New deal modal ────────────────────────────────────────────────────────────

interface Counterpart { id: string; name: string; sub: string; }

function NewDealModal({ viewAs, onClose, onCreated }: {
  viewAs: "startup" | "investor";
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState<Counterpart[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected]   = useState<Counterpart | null>(null);
  const [amount, setAmount]       = useState("");
  const [currency, setCurrency]   = useState(DEFAULT_CURRENCY);
  const [creating, setCreating]   = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim() || selected) { setResults([]); return; }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();
      const q = query.trim();
      if (viewAs === "startup") {
        const { data } = await supabase
          .from("investors")
          .select("id, slug, type, display_name, firm_name")
          .or(`display_name.ilike.%${q}%,firm_name.ilike.%${q}%`)
          .limit(8);
        setResults((data || []).map(i => ({
          id: i.id,
          name: i.display_name || i.firm_name || i.slug,
          sub: i.firm_name && i.display_name ? i.firm_name : i.type,
        })));
      } else {
        const { data } = await supabase
          .from("startups")
          .select("id, name, slug, industry")
          .eq("status", "active")
          .ilike("name", `%${q}%`)
          .limit(8);
        setResults((data || []).map(s => ({ id: s.id, name: s.name, sub: s.industry })));
      }
      setSearching(false);
    }, 300);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [query, selected, viewAs]);

  async function handleCreate() {
    if (!selected) return;
    setCreating(true);
    const res = await fetch("/api/deals/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        counterpartId: selected.id,
        amount: amount ? parseFloat(amount) : null,
        currency,
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) { notify.error(data.error || t("deals.dealCreateFailed")); return; }
    notify.success(t("deals.dealCreated"));
    onCreated();
    onClose();
  }

  return (
    <div
      role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)", borderRadius: "6px", width: "100%", maxWidth: "420px", padding: "24px", maxHeight: "80vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)" }}>{t("deals.newDealTitle")}</p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex" }}><X style={{ width: 16, height: 16 }} /></button>
        </div>

        {selected ? (
          <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "10px 12px", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{selected.name}</p>
              {selected.sub && <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>{selected.sub}</p>}
            </div>
            <button onClick={() => { setSelected(null); setQuery(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex" }}>
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
        ) : (
          <div style={{ marginBottom: "14px" }}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={viewAs === "startup" ? t("deals.searchInvestorPlaceholder") : t("deals.searchStartupPlaceholder")}
              style={{ width: "100%", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink)", padding: "9px 12px", outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "180px", overflowY: "auto" }}>
              {searching && (
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", padding: "6px 0" }}>{t("dashboard.searching")}</p>
              )}
              {!searching && query.trim() && results.length === 0 && (
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", padding: "6px 0" }}>{t("deals.noResults")}</p>
              )}
              {!searching && !query.trim() && (
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", padding: "6px 0" }}>{t("deals.startTyping")}</p>
              )}
              {results.map(r => (
                <button key={r.id} onClick={() => setSelected(r)}
                  style={{ textAlign: "left", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "8px 10px", cursor: "pointer" }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{r.name}</p>
                  {r.sub && <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>{r.sub}</p>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <span style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--cr-ink-4)", pointerEvents: "none" }}>
              {getCurrency(currency).symbol}
            </span>
            <input type="number" placeholder={t("deals.amountOptional")}
              value={amount} onChange={e => setAmount(e.target.value)}
              style={{ width: "100%", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", color: "var(--cr-ink)", paddingLeft: "34px", paddingRight: "10px", paddingTop: "9px", paddingBottom: "9px", outline: "none", boxSizing: "border-box" }} />
          </div>
          <select value={currency} onChange={e => setCurrency(e.target.value as typeof DEFAULT_CURRENCY)}
            aria-label={t("deals.currency")}
            style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink)", padding: "0 8px", outline: "none", cursor: "pointer" }}>
            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={handleCreate} disabled={!selected || creating}
            style={{ flex: 1, height: "38px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", cursor: !selected || creating ? "default" : "pointer", opacity: !selected || creating ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            {creating && <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />}
            {creating ? t("deals.creating") : t("deals.createDeal")}
          </button>
          <button onClick={onClose}
            style={{ height: "38px", padding: "0 16px", background: "transparent", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-3)", cursor: "pointer" }}>
            {t("deals.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Contracts section (inside a deal card) ────────────────────────────────────

function ContractsSection({ dealId }: { dealId: string }) {
  const { t } = useTranslation();
  const [open, setOpen]           = useState(false);
  const [loaded, setLoaded]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [showForm, setShowForm]   = useState(false);
  const [title, setTitle]         = useState("");
  const [type, setType]           = useState<ContractType>("term_sheet");
  const [amount, setAmount]       = useState("");
  const [currency, setCurrency]   = useState(DEFAULT_CURRENCY);
  const [equity, setEquity]       = useState("");
  const [terms, setTerms]         = useState("");
  const [creating, setCreating]   = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/contracts/list?dealId=${dealId}`);
    const data = await res.json();
    if (res.ok) setContracts(data.contracts || []);
    setLoading(false);
    setLoaded(true);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) load();
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setCreating(true);
    const res = await fetch("/api/contracts/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dealId,
        title,
        contractType: type,
        amount: amount ? parseFloat(amount) : null,
        currency,
        equityPercent: equity ? parseFloat(equity) : null,
        terms,
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) { notify.error(data.error || t("deals.contractCreateFailed")); return; }
    notify.success(t("deals.contractCreated"));
    setContracts(prev => [data.contract, ...prev]);
    setTitle(""); setAmount(""); setEquity(""); setTerms(""); setType("term_sheet");
    setShowForm(false);
  }

  const statusStyle: Record<Contract["status"], React.CSSProperties> = {
    draft:  { background: "var(--cr-paper-3)", color: "var(--cr-ink-3)", border: "1px solid var(--cr-rule)" },
    sent:   { background: "var(--cr-copper-bg)", color: "var(--cr-copper)", border: "1px solid var(--cr-copper-br)" },
    signed: { background: "var(--cr-up-bg)", color: "var(--cr-up)", border: "1px solid rgba(45,106,79,0.25)" },
    void:   { background: "var(--cr-down-bg)", color: "var(--cr-down)", border: "1px solid rgba(180,50,50,0.2)" },
  };

  return (
    <div style={{ marginTop: "10px", borderTop: "1px solid var(--cr-rule)", paddingTop: "10px" }}>
      <button onClick={toggle}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: "0" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <FileText style={{ width: 11, height: 11 }} />
          {t("deals.contracts")}{loaded && contracts.length > 0 ? ` (${contracts.length})` : ""}
        </span>
        <ChevronDown style={{ width: 13, height: 13, color: "var(--cr-ink-4)", transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
      </button>

      {open && (
        <div style={{ marginTop: "10px" }}>
          {loading && (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>…</p>
          )}
          {!loading && loaded && contracts.length === 0 && !showForm && (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "8px" }}>{t("deals.noContracts")}</p>
          )}
          {!loading && contracts.map(c => (
            <div key={c.id} style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "8px 10px", marginBottom: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</p>
                <span style={{ ...statusStyle[c.status], fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", borderRadius: "3px", padding: "2px 6px", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>
                  {t(`deals.contractStatus${c.status.charAt(0).toUpperCase()}${c.status.slice(1)}`)}
                </span>
              </div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", marginTop: "2px" }}>
                {t(CONTRACT_TYPE_KEY[c.contract_type])}
                {c.amount != null && ` · ${formatMoney(c.amount, c.currency, { compact: true })}`}
                {c.equity_percent != null && ` · ${c.equity_percent}%`}
              </p>
            </div>
          ))}

          {showForm ? (
            <div style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "10px" }}>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={t("deals.contractTitlePlaceholder")}
                style={{ width: "100%", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink)", padding: "6px 8px", outline: "none", boxSizing: "border-box", marginBottom: "6px" }} />
              <select value={type} onChange={e => setType(e.target.value as ContractType)}
                style={{ width: "100%", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink)", padding: "6px 8px", outline: "none", cursor: "pointer", marginBottom: "6px" }}>
                {CONTRACT_TYPES.map(ct => <option key={ct} value={ct}>{t(CONTRACT_TYPE_KEY[ct])}</option>)}
              </select>
              <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <span style={{ position: "absolute", left: "7px", top: "50%", transform: "translateY(-50%)", fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink-4)", pointerEvents: "none" }}>
                    {getCurrency(currency).symbol}
                  </span>
                  <input type="number" placeholder={t("deals.amountOptional")} value={amount} onChange={e => setAmount(e.target.value)}
                    style={{ width: "100%", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--cr-ink)", paddingLeft: "26px", paddingRight: "8px", paddingTop: "6px", paddingBottom: "6px", outline: "none", boxSizing: "border-box" }} />
                </div>
                <select value={currency} onChange={e => setCurrency(e.target.value as typeof DEFAULT_CURRENCY)}
                  style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink)", padding: "0 6px", outline: "none", cursor: "pointer" }}>
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
              </div>
              <input type="number" value={equity} onChange={e => setEquity(e.target.value)} placeholder={t("deals.equityOptional")}
                style={{ width: "100%", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--cr-ink)", padding: "6px 8px", outline: "none", boxSizing: "border-box", marginBottom: "6px" }} />
              <textarea value={terms} onChange={e => setTerms(e.target.value)} placeholder={t("deals.termsPlaceholder")} rows={2}
                style={{ width: "100%", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink)", padding: "6px 8px", outline: "none", boxSizing: "border-box", marginBottom: "8px", resize: "vertical" }} />
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={handleCreate} disabled={!title.trim() || creating}
                  style={{ flex: 1, height: "30px", background: "var(--cr-copper)", border: "none", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "#fff", cursor: !title.trim() || creating ? "default" : "pointer", opacity: !title.trim() || creating ? 0.5 : 1 }}>
                  {creating ? t("deals.creating") : t("deals.createContract")}
                </button>
                <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex", alignItems: "center" }}>
                  <X style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", background: "transparent", border: "1px dashed var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", padding: "7px 0", cursor: "pointer" }}>
              <Plus style={{ width: 11, height: 11 }} /> {t("deals.newContract")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Deal card ─────────────────────────────────────────────────────────────────

function DealCard({ deal, viewAs, onStatusChange, onDealClose, revealIdentity = true }: {
  deal: Deal;
  viewAs: "startup" | "investor" | "admin";
  onStatusChange?: (id: string, status: DealStatus) => void;
  onDealClose?: (id: string, amount: number, currency: string) => void;
  revealIdentity?: boolean;
}) {
  const { t } = useTranslation();
  const columns = useColumns();
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closeAmount, setCloseAmount]     = useState(deal.amount ? String(deal.amount) : "");
  const [closeCurrency, setCloseCurrency] = useState(deal.currency || DEFAULT_CURRENCY);
  const [closing, setClosing]             = useState(false);

  const investorName = (deal as any).investor?.display_name || (deal as any).investor?.firm_name || (deal as any).investor?.slug || t("deals.investorFallback");
  const startupName  = (deal as any).startup?.name || t("deals.startupFallback");

  const realName = viewAs === "admin" ? `${startupName} × ${investorName}`
    : viewAs === "startup" ? investorName
    : startupName;

  const masked = viewAs === "startup" && !revealIdentity;
  const name   = masked ? t("deals.interestedInvestor") : realName;

  const isActive = deal.status !== "closed" && deal.status !== "passed";

  async function handleClose() {
    if (!onDealClose) return;
    setClosing(true);
    await onDealClose(deal.id, parseFloat(closeAmount) || 0, closeCurrency);
    setClosing(false);
    setShowCloseForm(false);
  }

  return (
    <div style={{
      background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
      borderRadius: "4px", padding: "14px 16px",
      transition: "border-color 120ms ease",
    }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-paper-4)")}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")}
    >
      <p style={{
        fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px",
        color: masked ? "var(--cr-ink-4)" : "var(--cr-ink)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        display: "flex", alignItems: "center", gap: "5px",
      }}>
        {masked && <Lock style={{ width: 11, height: 11, flexShrink: 0 }} />}
        {name}
      </p>
      {masked && (
        <a href="/pricing" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", textDecoration: "none" }}>
          {t("deals.upgradeSeeWho")} →
        </a>
      )}
      {deal.amount != null && (
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)", marginTop: "4px", display: "flex", alignItems: "baseline", gap: "5px" }}>
          {formatMoney(deal.amount, deal.currency, { compact: true })}
          <span style={{ fontWeight: 400, fontSize: "10px", color: "var(--cr-ink-4)" }}>{getCurrency(deal.currency).code}</span>
        </p>
      )}
      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
        {formatDate(deal.updated_at)}
      </p>

      {/* Quick-move buttons */}
      {onStatusChange && isActive && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "10px" }}>
          {QUICK_MOVE.filter(s => s !== deal.status).map((s) => (
            <button key={s} onClick={() => onStatusChange(deal.id, s)}
              style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "11px", color: "var(--cr-copper)", padding: "0", textDecoration: "underline" }}>
              → {columns.find(c => c.status === s)?.label}
            </button>
          ))}
        </div>
      )}

      {/* Close deal */}
      {isActive && onDealClose && !showCloseForm && (
        <button onClick={() => setShowCloseForm(true)}
          style={{ marginTop: "10px", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.25)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-up)", padding: "7px 0", cursor: "pointer" }}>
          <CheckCircle2 style={{ width: 12, height: 12 }} /> {t("deals.closeDeal")}
        </button>
      )}

      {/* Close form */}
      {showCloseForm && (
        <div style={{ marginTop: "10px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "12px 14px" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-up)", marginBottom: "8px" }}>{t("deals.confirmClose")}</p>
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <span style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--cr-ink-4)", pointerEvents: "none" }}>
                {getCurrency(closeCurrency).symbol}
              </span>
              <input type="number" placeholder={t("deals.amountRaisedPlaceholder")}
                value={closeAmount} onChange={e => setCloseAmount(e.target.value)}
                style={{ width: "100%", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink)", paddingLeft: "34px", paddingRight: "10px", paddingTop: "6px", paddingBottom: "6px", outline: "none", boxSizing: "border-box" }} />
            </div>
            <select value={closeCurrency} onChange={e => setCloseCurrency(e.target.value)}
              aria-label={t("deals.currency")}
              style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink)", padding: "6px 8px", outline: "none", cursor: "pointer" }}>
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", marginBottom: "10px" }}>
            {t("deals.feeNotice")}
          </p>
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={handleClose} disabled={closing}
              style={{ flex: 1, height: "32px", background: "var(--cr-up)", border: "none", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "#fff", cursor: "pointer", opacity: closing ? 0.6 : 1 }}>
              {closing ? t("deals.closing") : t("deals.confirm")}
            </button>
            <button onClick={() => setShowCloseForm(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex", alignItems: "center" }}>
              <X style={{ width: 15, height: 15 }} />
            </button>
          </div>
        </div>
      )}

      {(deal as any).success_fee_invoiced && (
        <span style={{ display: "inline-block", marginTop: "8px", background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.25)", color: "var(--cr-up)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "2px 7px" }}>
          {t("deals.invoiceSent")}
        </span>
      )}

      <ContractsSection dealId={deal.id} />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function DealKanban({ deals, onStatusChange, onDealClose, viewAs, revealIdentity = true }: DealKanbanProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const columns = useColumns();
  const [showNewDeal, setShowNewDeal] = useState(false);

  // Admin isn't inherently one side of a deal, so the single-counterpart
  // picker below doesn't apply — admin only views and manages existing deals.
  const canCreateDeal = viewAs !== "admin";

  const newDealButton = canCreateDeal && (
    <button onClick={() => setShowNewDeal(true)}
      style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", padding: "9px 16px", cursor: "pointer" }}>
      <Plus style={{ width: 14, height: 14 }} /> {t("deals.newDeal")}
    </button>
  );

  const modal = canCreateDeal && showNewDeal && (
    <NewDealModal viewAs={viewAs as "startup" | "investor"} onClose={() => setShowNewDeal(false)} onCreated={() => router.refresh()} />
  );

  if (deals.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 24px", textAlign: "center" }}>
        <TrendingUp style={{ width: 36, height: 36, color: "var(--cr-ink-4)", marginBottom: "16px" }} />
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "18px", color: "var(--cr-ink)", marginBottom: "8px" }}>{t("deals.emptyTitle")}</p>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", marginBottom: "20px" }}>
          {t("deals.emptyDesc")}
        </p>
        {newDealButton}
        {modal}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        {newDealButton}
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", gap: "14px", minWidth: "max-content", paddingBottom: "8px" }}>
          {columns.map(col => {
            const colDeals = deals.filter(d => d.status === col.status);
            return (
              <div key={col.status} style={{ width: "264px", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <span style={colBadgeStyle(col.status, colDeals.length)}>{col.label}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>
                    {colDeals.length}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {colDeals.length === 0 ? <EmptySlot /> : colDeals.map(deal => (
                    <DealCard key={deal.id} deal={deal} viewAs={viewAs} revealIdentity={revealIdentity}
                      onStatusChange={onStatusChange} onDealClose={onDealClose} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {modal}
    </div>
  );
}
