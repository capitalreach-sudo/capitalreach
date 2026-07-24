"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";
import { formatMoney, CURRENCIES, getCurrency, isCurrencyCode, DEFAULT_CURRENCY } from "@/lib/currency";
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
const TERMS_PLACEHOLDER: Record<ContractType, string> = {
  term_sheet:       "Valuation cap, discount rate, pro-rata rights, board seat, liquidation preference…",
  safe:              "Valuation cap, discount rate, most-favored-nation clause…",
  convertible_note:  "Interest rate, maturity date, conversion trigger, valuation cap…",
  nda:               "Confidentiality scope, term length, exceptions…",
  custom:            "Key terms, conditions, notes…",
};
const NEXT_CONTRACT_STATUSES: Record<Contract["status"], Contract["status"][]> = {
  draft:  ["sent", "void"],
  sent:   ["signed", "void"],
  signed: [],
  void:   [],
};

// Own-side profile facts, used to show compatibility context when starting a new deal.
export type OwnProfile =
  | { kind: "startup"; fundingTarget: number | null; stage: string | null; industry: string | null; mrr: number | null; arr: number | null }
  | { kind: "investor"; minCheck: number | null; maxCheck: number | null; stages: string[] | null; industries: string[] | null };

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
  // The caller's own startup's equity_offered (startup view only) — used to
  // pre-fill new contracts. For investor/admin views this travels per-deal
  // via deal.startup instead.
  equityOffered?: number | null;
  // The caller's own startup/investor profile facts, used to show
  // compatibility context in the New Deal modal.
  ownProfile?: OwnProfile;
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

interface Counterpart {
  id: string; name: string; sub: string;
  fundingTarget?: number | null; minCheck?: number | null; maxCheck?: number | null;
}

// Whether a funding target falls inside a check-size range. Returns null when
// there isn't enough data on either side to compare.
function checkSizeFit(fundingTarget?: number | null, minCheck?: number | null, maxCheck?: number | null): boolean | null {
  if (fundingTarget == null || minCheck == null || maxCheck == null) return null;
  return fundingTarget >= minCheck && fundingTarget <= maxCheck;
}

// A short, data-driven compatibility note comparing the caller's own profile
// (fundingTarget for startups, check-size range for investors) against the
// selected counterpart. Returns null when there isn't enough data to compare.
function compatNote(viewAs: "startup" | "investor", own: OwnProfile | undefined, candidate: Counterpart): string | null {
  if (!own) return null;
  if (viewAs === "startup" && own.kind === "startup") {
    const fits = checkSizeFit(own.fundingTarget, candidate.minCheck, candidate.maxCheck);
    if (fits != null) return fits ? "Fits their check size range" : "Outside their typical check size";
  } else if (viewAs === "investor" && own.kind === "investor") {
    const fits = checkSizeFit(candidate.fundingTarget, own.minCheck, own.maxCheck);
    if (fits != null) return fits ? "Fits your check size range" : "Outside your typical check size";
  }
  return null;
}

// Debounced name search for one side of a deal (startups or investors).
function useCounterpartSearch(kind: "startup" | "investor") {
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState<Counterpart[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected]   = useState<Counterpart | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim() || selected) { setResults([]); return; }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();
      const q = query.trim();
      if (kind === "investor") {
        const { data } = await supabase
          .from("investors")
          .select("id, slug, type, display_name, firm_name, min_check, max_check")
          .or(`display_name.ilike.%${q}%,firm_name.ilike.%${q}%`)
          .limit(8);
        setResults((data || []).map(i => ({
          id: i.id,
          name: i.display_name || i.firm_name || i.slug,
          sub: i.firm_name && i.display_name ? i.firm_name : i.type,
          minCheck: i.min_check,
          maxCheck: i.max_check,
        })));
      } else {
        const { data } = await supabase
          .from("startups")
          .select("id, name, slug, industry, stage, funding_target")
          .eq("status", "active")
          .ilike("name", `%${q}%`)
          .limit(8);
        setResults((data || []).map(s => ({
          id: s.id, name: s.name,
          sub: `${s.industry}${s.stage ? ` · ${s.stage.replace(/_/g, " ")}` : ""}`,
          fundingTarget: s.funding_target,
        })));
      }
      setSearching(false);
    }, 300);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [query, selected, kind]);

  return { query, setQuery, results, searching, selected, setSelected };
}

type CounterpartSearch = ReturnType<typeof useCounterpartSearch>;

// One side of the New Deal picker: a search box + results, or the selected chip.
function CounterpartPicker({ search, placeholder, note, autoFocus = false }: {
  search: CounterpartSearch;
  placeholder: string;
  note: (c: Counterpart) => string | null;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const { query, setQuery, results, searching, selected, setSelected } = search;

  if (selected) {
    return (
      <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "10px 12px", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{selected.name}</p>
          {selected.sub && <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>{selected.sub}</p>}
          {selected.fundingTarget != null && (
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 400, fontSize: "11px", color: "var(--cr-ink-3)", marginTop: "2px" }}>
              Target {formatMoney(selected.fundingTarget, "USD", { compact: true })}
            </p>
          )}
          {selected.minCheck != null && selected.maxCheck != null && (
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 400, fontSize: "11px", color: "var(--cr-ink-3)", marginTop: "2px" }}>
              Check {formatMoney(selected.minCheck, "USD", { compact: true })}–{formatMoney(selected.maxCheck, "USD", { compact: true })}
            </p>
          )}
          {(() => {
            const n = note(selected);
            return n ? <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", marginTop: "3px" }}>{n}</p> : null;
          })()}
        </div>
        <button onClick={() => { setSelected(null); setQuery(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex" }}>
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "14px" }}>
      <input
        autoFocus={autoFocus}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={placeholder}
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
            {(() => {
              const n = note(r);
              return n ? <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-copper)", marginTop: "2px" }}>{n}</p> : null;
            })()}
          </button>
        ))}
      </div>
    </div>
  );
}

function NewDealModal({ viewAs, ownProfile, onClose, onCreated }: {
  viewAs: "startup" | "investor" | "admin";
  ownProfile?: OwnProfile;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const isAdmin = viewAs === "admin";
  // Both hooks are always called (rules of hooks); non-admin callers only
  // render and use the one representing "the other side" of the deal.
  const startupSearch  = useCounterpartSearch("startup");
  const investorSearch = useCounterpartSearch("investor");
  const counterpartSearch = viewAs === "startup" ? investorSearch : startupSearch;
  const [amount, setAmount]     = useState("");
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [creating, setCreating] = useState(false);

  const canSubmit = isAdmin
    ? !!startupSearch.selected && !!investorSearch.selected
    : !!counterpartSearch.selected;

  async function handleCreate() {
    if (!canSubmit) return;
    setCreating(true);
    const body: Record<string, unknown> = { amount: amount ? parseFloat(amount) : null, currency };
    if (isAdmin) {
      body.startupId  = startupSearch.selected!.id;
      body.investorId = investorSearch.selected!.id;
    } else {
      body.counterpartId = counterpartSearch.selected!.id;
    }
    const res = await fetch("/api/deals/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

        {isAdmin ? (
          <>
            <CounterpartPicker
              search={startupSearch}
              placeholder={t("deals.searchStartupPlaceholder")}
              autoFocus
              note={c => {
                const fits = checkSizeFit(c.fundingTarget, investorSearch.selected?.minCheck, investorSearch.selected?.maxCheck);
                return fits == null ? null : fits ? "Fits selected investor's check size" : "Outside selected investor's check size";
              }}
            />
            <CounterpartPicker
              search={investorSearch}
              placeholder={t("deals.searchInvestorPlaceholder")}
              note={c => {
                const fits = checkSizeFit(startupSearch.selected?.fundingTarget, c.minCheck, c.maxCheck);
                return fits == null ? null : fits ? "Fits selected startup's funding target" : "Outside selected startup's funding target";
              }}
            />
          </>
        ) : (
          <CounterpartPicker
            search={counterpartSearch}
            placeholder={viewAs === "startup" ? t("deals.searchInvestorPlaceholder") : t("deals.searchStartupPlaceholder")}
            autoFocus
            note={c => compatNote(viewAs, ownProfile, c)}
          />
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
          <button onClick={handleCreate} disabled={!canSubmit || creating}
            style={{ flex: 1, height: "38px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", cursor: !canSubmit || creating ? "default" : "pointer", opacity: !canSubmit || creating ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
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

function ContractsSection({ dealId, dealAmount, dealCurrency, equityOffered, startupId, investorId }: {
  dealId: string;
  dealAmount?: number | null;
  dealCurrency?: string | null;
  equityOffered?: number | null;
  startupId: string;
  investorId: string;
}) {
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
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [ndaStatus, setNdaStatus] = useState<"none" | "pending" | "signed" | null>(null);
  const [ndaSending, setNdaSending] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/contracts/list?dealId=${dealId}`);
    const data = await res.json();
    const list: Contract[] = res.ok ? (data.contracts || []) : [];
    setContracts(list);
    setLoading(false);
    setLoaded(true);
    if (list.some(c => c.contract_type === "nda")) loadNdaStatus();
  }

  async function loadNdaStatus() {
    const res = await fetch(`/api/nda/status?startupId=${startupId}&investorId=${investorId}`);
    const data = await res.json();
    if (res.ok) setNdaStatus(data.status);
  }

  async function sendNda() {
    setNdaSending(true);
    const res = await fetch("/api/nda/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId, investorId }),
    });
    const data = await res.json();
    setNdaSending(false);
    if (!res.ok) { notify.error(data.error || t("deals.ndaSendFailed")); return; }
    notify.success(t("deals.ndaSent"));
    loadNdaStatus();
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) load();
  }

  function handleTypeChange(next: ContractType) {
    setType(next);
    if ((next === "term_sheet" || next === "safe" || next === "convertible_note")) {
      if (!amount && dealAmount != null) setAmount(String(dealAmount));
      if (isCurrencyCode(dealCurrency)) setCurrency(dealCurrency);
      if (!equity && equityOffered != null) setEquity(String(equityOffered));
    }
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
    if (type === "nda") loadNdaStatus();
    setTitle(""); setAmount(""); setEquity(""); setTerms(""); setType("term_sheet");
    setShowForm(false);
  }

  async function updateStatus(contractId: string, status: Contract["status"]) {
    setUpdatingId(contractId);
    const res = await fetch("/api/contracts/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractId, status }),
    });
    const data = await res.json();
    setUpdatingId(null);
    if (!res.ok) { notify.error(data.error || t("deals.contractUpdateFailed")); return; }
    notify.success(t("deals.contractUpdated"));
    setContracts(prev => prev.map(c => (c.id === contractId ? data.contract : c)));
  }

  const statusStyle: Record<Contract["status"], React.CSSProperties> = {
    draft:  { background: "var(--cr-paper-3)", color: "var(--cr-ink-3)", border: "1px solid var(--cr-rule)" },
    sent:   { background: "var(--cr-copper-bg)", color: "var(--cr-copper)", border: "1px solid var(--cr-copper-br)" },
    signed: { background: "var(--cr-up-bg)", color: "var(--cr-up)", border: "1px solid rgba(45,106,79,0.25)" },
    void:   { background: "var(--cr-down-bg)", color: "var(--cr-down)", border: "1px solid rgba(180,50,50,0.2)" },
  };

  const STATUS_ACTION_KEY: Record<Contract["status"], string> = {
    draft: "", sent: "deals.markAsSent", signed: "deals.markAsSigned", void: "deals.voidContract",
  };

  const ndaStatusLabel: Record<string, string> = {
    none: t("deals.ndaNotSent"),
    pending: t("deals.ndaPending"),
    signed: t("deals.ndaSigned"),
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

              {c.contract_type === "nda" && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", marginTop: "6px", paddingTop: "6px", borderTop: "1px solid var(--cr-rule)" }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: ndaStatus === "signed" ? "var(--cr-up)" : "var(--cr-ink-4)" }}>
                    {ndaStatusLabel[ndaStatus || "none"]}
                  </span>
                  {ndaStatus !== "signed" && (
                    <button onClick={sendNda} disabled={ndaSending}
                      style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-copper)", textDecoration: "underline", opacity: ndaSending ? 0.6 : 1 }}>
                      {ndaSending ? t("deals.sending") : ndaStatus === "pending" ? t("deals.ndaResend") : t("deals.ndaSendForSignature")}
                    </button>
                  )}
                </div>
              )}

              {NEXT_CONTRACT_STATUSES[c.status].length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "6px" }}>
                  {NEXT_CONTRACT_STATUSES[c.status].map(next => (
                    <button key={next} onClick={() => updateStatus(c.id, next)} disabled={updatingId === c.id}
                      style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "10px", color: next === "void" ? "var(--cr-down)" : "var(--cr-copper)", textDecoration: "underline", opacity: updatingId === c.id ? 0.6 : 1 }}>
                      {t(STATUS_ACTION_KEY[next])}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {showForm ? (
            <div style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "10px" }}>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={t("deals.contractTitlePlaceholder")}
                style={{ width: "100%", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink)", padding: "6px 8px", outline: "none", boxSizing: "border-box", marginBottom: "6px" }} />
              <select value={type} onChange={e => handleTypeChange(e.target.value as ContractType)}
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
              <textarea value={terms} onChange={e => setTerms(e.target.value)} placeholder={TERMS_PLACEHOLDER[type]} rows={2}
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

// ── Resources section (documents + AI due diligence, inside a deal card) ──────

interface DealResourceReport { id: string; content: string; created_at: string }
interface DealResourceDoc { id: string; label: string; type: string; file_url: string; locked: boolean }
interface DealResources { reports: DealResourceReport[]; documents: DealResourceDoc[]; ndaStatus: "none" | "pending" | "signed" }

function ResourcesSection({ dealId, startupId, viewAs }: { dealId: string; startupId: string; viewAs: "startup" | "investor" | "admin" }) {
  const { t } = useTranslation();
  const [open, setOpen]       = useState(false);
  const [loaded, setLoaded]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState<DealResources | null>(null);
  const [generating, setGenerating] = useState(false);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/deals/resources?dealId=${dealId}`);
    const json = await res.json();
    if (res.ok) setData(json);
    setLoading(false);
    setLoaded(true);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) load();
  }

  async function generateReport() {
    setGenerating(true);
    const res = await fetch("/api/ai/due-diligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startupId }),
    });
    const json = await res.json();
    setGenerating(false);
    if (!res.ok) { notify.error(json.error || t("deals.reportGenerateFailed")); return; }
    notify.success(t("deals.reportGenerated"));
    load();
  }

  return (
    <div style={{ marginTop: "10px", borderTop: "1px solid var(--cr-rule)", paddingTop: "10px" }}>
      <button onClick={toggle}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: "0" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <FileText style={{ width: 11, height: 11 }} />
          {t("deals.resources")}
        </span>
        <ChevronDown style={{ width: 13, height: 13, color: "var(--cr-ink-4)", transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
      </button>

      {open && (
        <div style={{ marginTop: "10px" }}>
          {loading && <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>…</p>}

          {!loading && loaded && data && (
            <>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{t("deals.documents")}</p>
              {data.documents.length === 0 && (
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "8px" }}>{t("deals.noDocuments")}</p>
              )}
              {data.documents.map(doc => (
                <div key={doc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", padding: "5px 0" }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)", display: "flex", alignItems: "center", gap: "5px" }}>
                    {doc.locked && <Lock style={{ width: 10, height: 10 }} />}
                    {doc.label}
                  </span>
                  {doc.locked ? (
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "10px", color: "var(--cr-ink-4)" }}>{t("deals.requiresNda")}</span>
                  ) : (
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", textDecoration: "underline" }}>
                      {t("deals.viewDocument")}
                    </a>
                  )}
                </div>
              ))}

              {(viewAs === "investor" || data.reports.length > 0) && (
                <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid var(--cr-rule)" }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{t("deals.dueDiligenceReports")}</p>
                  {data.reports.length === 0 && (
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "8px" }}>{t("deals.noReports")}</p>
                  )}
                  {data.reports.map(r => (
                    <div key={r.id} style={{ marginBottom: "6px" }}>
                      <button onClick={() => setExpandedReport(expandedReport === r.id ? null : r.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", textDecoration: "underline" }}>
                        {formatDate(r.created_at)} {expandedReport === r.id ? "▲" : "▼"}
                      </button>
                      {expandedReport === r.id && (
                        <div style={{ marginTop: "6px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "10px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-3)", whiteSpace: "pre-wrap", maxHeight: "240px", overflowY: "auto" }}>
                          {r.content}
                        </div>
                      )}
                    </div>
                  ))}
                  {viewAs === "investor" && (
                    <button onClick={generateReport} disabled={generating}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", background: "transparent", border: "1px dashed var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", padding: "7px 0", cursor: "pointer", opacity: generating ? 0.6 : 1 }}>
                      {generating && <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" />}
                      {generating ? t("deals.generating") : t("deals.generateReport")}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Deal card ─────────────────────────────────────────────────────────────────

function DealCard({ deal, viewAs, onStatusChange, onDealClose, revealIdentity = true, equityOffered = null }: {
  deal: Deal;
  viewAs: "startup" | "investor" | "admin";
  onStatusChange?: (id: string, status: DealStatus) => void;
  onDealClose?: (id: string, amount: number, currency: string) => void;
  revealIdentity?: boolean;
  equityOffered?: number | null;
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

      <ResourcesSection dealId={deal.id} startupId={deal.startup_id} viewAs={viewAs} />
      <ContractsSection
        dealId={deal.id}
        dealAmount={deal.amount}
        dealCurrency={deal.currency}
        equityOffered={viewAs === "startup" ? equityOffered : (deal as any).startup?.equity_offered ?? null}
        startupId={deal.startup_id}
        investorId={deal.investor_id}
      />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function DealKanban({ deals, onStatusChange, onDealClose, viewAs, revealIdentity = true, equityOffered = null, ownProfile }: DealKanbanProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const columns = useColumns();
  const [showNewDeal, setShowNewDeal] = useState(false);

  const newDealButton = (
    <button onClick={() => setShowNewDeal(true)}
      style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", padding: "9px 16px", cursor: "pointer" }}>
      <Plus style={{ width: 14, height: 14 }} /> {t("deals.newDeal")}
    </button>
  );

  const modal = showNewDeal && (
    <NewDealModal viewAs={viewAs} ownProfile={ownProfile} onClose={() => setShowNewDeal(false)} onCreated={() => router.refresh()} />
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
                    <DealCard key={deal.id} deal={deal} viewAs={viewAs} revealIdentity={revealIdentity} equityOffered={equityOffered}
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
