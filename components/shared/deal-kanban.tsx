"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DealProposals } from "@/components/shared/deal-proposals";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { formatDate, daysSince, STAGE_LABELS } from "@/lib/utils";

// The filter chips and list view show either an investor type or a startup
// stage. Rendered raw with text-transform:capitalize, "vc" became "Vc" and
// "family_office" became "Family office"; route both through the same labels
// the directories use.
const INVESTOR_TYPE_KEYS: Record<string, string> = {
  angel: "investors.typeAngel",
  vc: "investors.typeVc",
  family_office: "investors.typeFamilyOffice",
  corporate: "investors.typeCorporate",
};
import { formatMoney, CURRENCIES, getCurrency, isCurrencyCode, DEFAULT_CURRENCY } from "@/lib/currency";
import { X, CheckCircle2, TrendingUp, Lock, Plus, FileText, ChevronDown, Loader2, LayoutGrid, List, Circle } from "lucide-react";
import { notify } from "@/components/ui/toast-notify";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { InfoTip } from "@/components/shared/info-tip";
import type { Deal, DealStatus, Contract, ContractType, DealActivity } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { scheduleTotal, scheduleReconciles, receivedTotal, allReceived } from "@/lib/tranches";

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
    { status: "due_diligence",  label: t("deals.colNegotiation"), copperActive: false },
    { status: "term_sheet",     label: t("deals.colTermSheet"),     copperActive: true  },
    { status: "closed",         label: t("deals.colClosed"),        copperActive: false },
    { status: "passed",         label: t("deals.colPassed"),        copperActive: false },
  ];
}

const QUICK_MOVE: DealStatus[] = ["due_diligence", "term_sheet", "passed"];

interface DealKanbanProps {
  deals: Deal[];
  onProposalsChanged?: () => void;
  onStatusChange?: (dealId: string, status: DealStatus, reason?: string) => void;
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
  // Whether to show the CSV export button — computed server-side (admin
  // always, investors gated by canExportData(), never shown for startups).
  canExport?: boolean;
  onSetFollowUp?: (dealId: string, date: string | null) => void;
  /** B17: record the commitment level (and optionally a new amount). */
  onSetCommitment?: (dealId: string, commitmentType: CommitmentType, amount?: number | null) => void;
}

export type CommitmentType = "interest" | "soft_circle" | "verbal" | "committed";
const COMMITMENT_KEY: Record<CommitmentType, string> = {
  interest: "deals.commitInterest", soft_circle: "deals.commitSoft", verbal: "deals.commitVerbal", committed: "deals.commitCommitted",
};

// A deal's counterpart display names, computed from its joined startup/investor
// rows. Shared between DealCard and the filter/search/export logic below.
function dealNames(deal: Deal, t: (key: string) => string): { investorName: string; startupName: string } {
  const investorName = deal.investor?.display_name || deal.investor?.firm_name || deal.investor?.slug || t("deals.investorFallback");
  const startupName  = deal.startup?.name || t("deals.startupFallback");
  return { investorName, startupName };
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

/** How many cards a column shows before it offers the rest. */
const COLUMN_PREVIEW = 5;

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
  // Not every deal starts at intro -- plenty are already in conversation by the
  // time someone records them here. Closed/passed are excluded on the server
  // too; closing has to go through the success-fee flow.
  const [startStatus, setStartStatus] = useState<DealStatus>("intro");
  const [note, setNote]               = useState("");
  const [followUp, setFollowUp]       = useState("");

  const canSubmit = isAdmin
    ? !!startupSearch.selected && !!investorSearch.selected
    : !!counterpartSearch.selected;

  async function handleCreate() {
    if (!canSubmit) return;
    setCreating(true);
    const body: Record<string, unknown> = {
      amount: amount ? parseFloat(amount) : null,
      currency,
      status: startStatus,
      note: note.trim() || null,
      nextFollowUp: followUp || null,
    };
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
    // Consent flow (091): with a real counterparty the create returns a
    // pending proposal, not a deal. Saying "deal created" would be a lie the
    // other side has not agreed to yet.
    notify.success(data.proposal ? t("proposals.sent") : t("deals.dealCreated"));
    onCreated();
    onClose();
  }

  useEscapeKey(true, onClose);

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
          <button onClick={onClose} aria-label={t("common.close")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex" }}><X style={{ width: 16, height: 16 }} /></button>
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



        {/* Starting stage + follow-up date */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--cr-ink-4)", marginBottom: "4px" }}>
              {t("deals.startingStage")}
            </label>
            <select value={startStatus} onChange={e => setStartStatus(e.target.value as DealStatus)}
              style={{ width: "100%", height: "36px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink)", padding: "0 8px", outline: "none", cursor: "pointer", boxSizing: "border-box" }}>
              <option value="intro">{t("deals.colIntro")}</option>
              {/* Same key the board's own column header uses, so the dropdown
                  and the column a new deal lands in always read identically. */}
              <option value="due_diligence">{t("deals.colNegotiation")}</option>
              <option value="term_sheet">{t("deals.colTermSheet")}</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--cr-ink-4)", marginBottom: "4px" }}>
              {t("deals.followUpOptional")}
            </label>
            <input type="date" value={followUp} onChange={e => setFollowUp(e.target.value)}
              style={{ width: "100%", height: "36px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--cr-ink)", padding: "0 8px", outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>

        {/* Opening note — seeds the deal's activity timeline, which otherwise
            starts empty and gives no record of why the deal was opened. */}
        <textarea value={note} onChange={e => setNote(e.target.value)}
          placeholder={t("deals.openingNotePlaceholder")} rows={2} maxLength={2000}
          style={{ width: "100%", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink)", padding: "8px 10px", outline: "none", marginBottom: "12px", resize: "vertical", boxSizing: "border-box" }} />

        {/* The consent contract, stated where the button is: nothing lands
            in anyone's pipeline until the other side says yes. */}
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", marginBottom: "6px" }}>
          {t("deals.consentNotice")}
        </p>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", marginBottom: "12px" }}>
          {t("deals.circumventionNotice")}
        </p>

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
  const [signing, setSigning] = useState<Contract | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signBusy, setSignBusy] = useState(false);
  useEscapeKey(!!signing, () => setSigning(null));

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/contracts/list?dealId=${dealId}`);
      const data = await res.json();
      const list: Contract[] = res.ok ? (data.contracts || []) : [];
      setContracts(list);
      if (list.some(c => c.contract_type === "nda")) loadNdaStatus();
    } catch { setContracts([]); } finally {
      setLoading(false);
      setLoaded(true);
    }
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

  async function signContract() {
    if (!signing || !signerName.trim() || signBusy) return;
    setSignBusy(true);
    try {
      const res = await fetch("/api/contracts/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId: signing.id, signerName: signerName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { notify.error(data.error || t("errors.generic")); return; }
      notify.success(t("deals.contractSigned"));
      if (data.contract) setContracts(prev => prev.map(c => (c.id === signing.id ? data.contract : c)));
      setSigning(null);
      setSignerName("");
    } catch {
      notify.error(t("errors.generic"));
    } finally {
      setSignBusy(false);
    }
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
              {/* D38: the executed document plus its signature certificate —
                  the artefact a lawyer asks for, printable to PDF. */}
              <a href={`/contracts/${c.id}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-block", marginTop: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10.5px", color: "var(--cr-copper)", textDecoration: "none" }}>
                {c.status === "signed" ? t("contracts.viewExecuted") : t("contracts.viewDocument")} →
              </a>

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
                    next === "signed" ? (
                      <button key={next} onClick={() => { setSigning(c); setSignerName(""); }}
                        style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", color: "var(--cr-copper)", textDecoration: "underline" }}>
                        {t("deals.signContract")}
                      </button>
                    ) : (
                      <button key={next} onClick={() => updateStatus(c.id, next)} disabled={updatingId === c.id}
                        style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "10px", color: next === "void" ? "var(--cr-down)" : "var(--cr-copper)", textDecoration: "underline", opacity: updatingId === c.id ? 0.6 : 1 }}>
                        {t(STATUS_ACTION_KEY[next])}
                      </button>
                    )
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

      {signing && (
        <div role="dialog" aria-modal="true" onClick={() => setSigning(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.5)", zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)", borderRadius: "8px", width: "100%", maxWidth: "480px", maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid var(--cr-rule)" }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)" }}>{t("deals.signTitle", { title: signing.title || t("deals.contract") })}</p>
            </div>
            <div style={{ padding: "16px 24px", overflowY: "auto" }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12.5px", color: "var(--cr-ink-3)", lineHeight: 1.55, marginBottom: "14px" }}>{t("deals.signIntro")}</p>
              {signing.terms && (
                <pre style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-2)", lineHeight: 1.6, whiteSpace: "pre-wrap", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "14px 16px", margin: "0 0 14px", maxHeight: "180px", overflowY: "auto" }}>{signing.terms}</pre>
              )}
              <label style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>{t("deals.signNameLabel")}</label>
              <input value={signerName} onChange={e => setSignerName(e.target.value)} autoFocus
                placeholder={t("deals.signNamePlaceholder")}
                style={{ width: "100%", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', serif", fontStyle: "italic", fontSize: "16px", color: "var(--cr-ink)", padding: "10px 12px", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", padding: "14px 24px 18px", borderTop: "1px solid var(--cr-rule)" }}>
              <button onClick={() => setSigning(null)} style={{ height: "38px", padding: "0 16px", background: "transparent", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-3)", cursor: "pointer" }}>{t("common.cancel")}</button>
              <button onClick={signContract} disabled={signBusy || signerName.trim().length < 2}
                style={{ height: "38px", padding: "0 20px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", cursor: "pointer", opacity: signBusy || signerName.trim().length < 2 ? 0.5 : 1 }}>
                {signBusy ? t("common.saving") : t("deals.signConfirm")}
              </button>
            </div>
          </div>
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
  const [dealDocs, setDealDocs] = useState<Array<{ id: string; uploader_side: string; file_name: string; file_size: number | null; created_at: string }>>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const dealDocInput = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const [res, docsRes] = await Promise.all([
        fetch(`/api/deals/resources?dealId=${dealId}`),
        fetch(`/api/deals/documents?dealId=${dealId}`),
      ]);
      const json = await res.json();
      if (res.ok) setData(json);
      const docsJson = await docsRes.json().catch(() => ({}));
      if (docsRes.ok) setDealDocs(docsJson.documents ?? []);
    } catch { /* section shows its empty state */ } finally {
      setLoading(false);
      setLoaded(true);
    }
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

  async function uploadDealDoc(file: File) {
    setUploadingDoc(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dealId", dealId);
      const res = await fetch("/api/deals/documents", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { notify.error(json.error || t("errors.generic")); return; }
      setDealDocs(prev => [json.document, ...prev]);
      notify.success(t("deals.docUploaded"));
    } catch {
      notify.error(t("errors.generic"));
    } finally {
      setUploadingDoc(false);
      if (dealDocInput.current) dealDocInput.current.value = "";
    }
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

              {/* Shared deal room — both sides upload here (append-only). */}
              <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid var(--cr-rule)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>{t("deals.sharedRoom")}</p>
                  {(viewAs === "startup" || viewAs === "investor") && (
                    <>
                      <input ref={dealDocInput} type="file" style={{ display: "none" }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadDealDoc(f); }} />
                      <button onClick={() => dealDocInput.current?.click()} disabled={uploadingDoc}
                        style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", color: "var(--cr-copper)", textDecoration: "underline", opacity: uploadingDoc ? 0.6 : 1 }}>
                        {uploadingDoc ? t("common.saving") : t("deals.uploadDoc")}
                      </button>
                    </>
                  )}
                </div>
                {dealDocs.length === 0 && (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "8px" }}>{t("deals.sharedRoomEmpty")}</p>
                )}
                {dealDocs.map(d => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", padding: "5px 0" }}>
                    <span style={{ minWidth: 0, fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)", display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                      <FileText style={{ width: 11, height: 11, flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.file_name}</span>
                      <span style={{ flexShrink: 0, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.04em" }}>· {d.uploader_side === "startup" ? t("deals.fromFounder") : t("deals.fromInvestor")}</span>
                    </span>
                    <a href={`/api/deals/documents/download?id=${d.id}`} target="_blank" rel="noopener noreferrer"
                      style={{ flexShrink: 0, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", textDecoration: "underline" }}>
                      {t("deals.viewDocument")}
                    </a>
                  </div>
                ))}
              </div>

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

/**
 * D37: a closed deal is not a funded deal. Two one-way confirmations —
 * the investor says the money left, the founder says it arrived — and the
 * round is done when both are in.
 *
 * The warning is not decoration: a compromised account editing wire
 * details is the most common fraud in this flow, and the platform
 * deliberately never holds or transmits bank details.
 */
function FundingBlock({ deal, viewAs }: { deal: Deal; viewAs: "startup" | "investor" | "admin" }) {
  const { t } = useTranslation();
  const d = deal as unknown as { funds_sent_at?: string | null; funds_received_at?: string | null; funded_at?: string | null; funding_reference?: string | null };
  const [sentAt, setSentAt] = useState<string | null>(d.funds_sent_at ?? null);
  const [recvAt, setRecvAt] = useState<string | null>(d.funds_received_at ?? null);
  const [fundedAt, setFundedAt] = useState<string | null>(d.funded_at ?? null);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [tranches, setTranches] = useState<Tranche[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/deals/tranches?dealId=${deal.id}`)
      .then(r => r.ok ? r.json() : { tranches: [] })
      .then(j => { if (live) setTranches(j.tranches ?? []); })
      .catch(() => { if (live) setTranches([]); });
    return () => { live = false; };
  }, [deal.id]);

  async function confirm(step: "sent" | "received") {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/deals/funding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId: deal.id, step, reference: ref || undefined }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { notify.error(j.error || t("errors.generic")); return; }
    setSentAt(j.fundsSentAt ?? sentAt); setRecvAt(j.fundsReceivedAt ?? recvAt); setFundedAt(j.fundedAt ?? null);
    notify.success(j.fundedAt ? t("funding.funded") : t("funding.recorded"));
  }

  const row = (label: string, at: string | null, canAct: boolean, step: "sent" | "received") => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "5px 0" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "11.5px", color: at ? "var(--cr-up)" : "var(--cr-ink-3)" }}>
        {at ? <CheckCircle2 style={{ width: 12, height: 12 }} /> : <Circle style={{ width: 12, height: 12, color: "var(--cr-ink-4)" }} />}
        {label}
        {at && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-4)" }}>{formatDate(at)}</span>}
      </span>
      {!at && canAct && (
        <button onClick={() => confirm(step)} disabled={busy}
          style={{ background: "transparent", border: "1px solid var(--cr-up)", color: "var(--cr-up)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10.5px", padding: "3px 9px", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {t("funding.confirm")}
        </button>
      )}
    </div>
  );

  const isExternalInv = !!(deal.investor as unknown as { is_external?: boolean } | null)?.is_external;

  // D39: when a schedule exists it replaces the single pair of confirmations
  // — confirming "the money arrived" once would be false for a deal that is
  // being paid in instalments.
  if (tranches === null) return null;
  if (tranches.length > 0) {
    return (
      <TrancheBlock deal={deal} viewAs={viewAs} initial={tranches} onChange={setTranches} isExternalInv={isExternalInv} />
    );
  }

  return (
    <div style={{ marginTop: "10px", background: fundedAt ? "var(--cr-up-bg)" : "var(--cr-paper-3)", border: `1px solid ${fundedAt ? "rgba(45,106,79,0.25)" : "var(--cr-rule-dark)"}`, borderRadius: "4px", padding: "10px 12px" }}>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: fundedAt ? "var(--cr-up)" : "var(--cr-ink)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
        {fundedAt ? t("funding.fundedTitle") : t("funding.title")}
      </p>
      {row(t("funding.sent"), sentAt, viewAs === "investor" || (isExternalInv && viewAs === "startup"), "sent")}
      {row(t("funding.received"), recvAt, viewAs === "startup", "received")}
      {!fundedAt && (viewAs === "startup" || viewAs === "investor") && (
        <>
          <input value={ref} onChange={(e) => setRef(e.target.value.slice(0, 120))} placeholder={t("funding.refPh")}
            style={{ width: "100%", boxSizing: "border-box", marginTop: 6, background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink)", padding: "5px 8px", outline: "none" }} />
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "10.5px", color: "var(--cr-down)", marginTop: 7, lineHeight: 1.45 }}>
            {t("funding.fraudWarning")}
          </p>
        </>
      )}
      {d.funding_reference && <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-4)", marginTop: 4 }}>{t("funding.ref")}: {d.funding_reference}</p>}
      {!sentAt && !recvAt && (viewAs === "startup" || viewAs === "investor") && (
        <TrancheEditor deal={deal} onSaved={setTranches} />
      )}
    </div>
  );
}

export type Tranche = {
  id: string; position: number; label: string | null; amount: number;
  due_date: string | null; condition: string | null;
  funds_sent_at: string | null; funds_received_at: string | null; reference: string | null;
};

/**
 * D39: propose a schedule. Only offered before either side has confirmed
 * anything — once money has moved, the schedule is history, not a draft.
 * The total is checked against the deal amount here as well as on the
 * server, so the mismatch is visible while it is still being typed.
 */
function TrancheEditor({ deal, onSaved }: { deal: Deal; onSaved: (t: Tranche[]) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ label: string; amount: string; dueDate: string; condition: string }[]>([
    { label: "", amount: "", dueDate: "", condition: "" },
    { label: "", amount: "", dueDate: "", condition: "" },
  ]);
  const [busy, setBusy] = useState(false);

  const total = scheduleTotal(rows.map(r => r.amount));
  const target = deal.amount != null ? Number(deal.amount) : null;
  const mismatch = total > 0 && !scheduleReconciles(rows.map(r => r.amount).filter(a => Number(a) > 0), target);

  async function save() {
    if (busy) return;
    const payload = rows.filter(r => Number(r.amount) > 0).map(r => ({
      label: r.label || undefined, amount: Number(r.amount),
      dueDate: r.dueDate || undefined, condition: r.condition || undefined,
    }));
    if (payload.length < 2) { notify.error(t("tranches.needTwo")); return; }
    setBusy(true);
    const res = await fetch("/api/deals/tranches", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId: deal.id, action: "save", tranches: payload }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { notify.error(j.error || t("errors.generic")); return; }
    onSaved(j.tranches ?? []);
    notify.success(t("tranches.saved"));
  }

  const cell: React.CSSProperties = { background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink)", padding: "4px 7px", outline: "none", minWidth: 0 };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ marginTop: 8, background: "transparent", border: "none", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10.5px", cursor: "pointer", padding: 0 }}>
        {t("tranches.add")}
      </button>
    );
  }
  return (
    <div style={{ marginTop: 8, borderTop: "1px solid var(--cr-rule)", paddingTop: 8 }}>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10.5px", color: "var(--cr-ink)", marginBottom: 6 }}>{t("tranches.editorTitle")}</p>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 5 }}>
          <input value={r.label} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, label: e.target.value.slice(0, 80) } : x))} placeholder={t("tranches.labelPh")} style={cell} />
          <input value={r.amount} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} inputMode="decimal" placeholder={t("tranches.amountPh")} style={cell} />
          <input type="date" value={r.dueDate} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, dueDate: e.target.value } : x))} style={cell} />
          <input value={r.condition} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, condition: e.target.value.slice(0, 200) } : x))} placeholder={t("tranches.conditionPh")} style={cell} />
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <button onClick={() => setRows([...rows, { label: "", amount: "", dueDate: "", condition: "" }])} disabled={rows.length >= 12}
          style={{ background: "transparent", border: "none", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10.5px", cursor: "pointer", padding: 0, opacity: rows.length >= 12 ? 0.4 : 1 }}>
          {t("tranches.addRow")}
        </button>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: mismatch ? "var(--cr-down)" : "var(--cr-ink-4)" }}>
          {formatMoney(total, deal.currency, { compact: true })}
          {target != null && ` / ${formatMoney(target, deal.currency, { compact: true })}`}
        </span>
      </div>
      {mismatch && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10.5px", color: "var(--cr-down)", marginTop: 5 }}>{t("tranches.mismatch")}</p>}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button onClick={save} disabled={busy || mismatch}
          style={{ background: "var(--cr-ink)", border: "none", color: "var(--cr-paper)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10.5px", padding: "4px 12px", cursor: busy || mismatch ? "not-allowed" : "pointer", opacity: busy || mismatch ? 0.5 : 1 }}>
          {t("tranches.save")}
        </button>
        <button onClick={() => setOpen(false)}
          style={{ background: "transparent", border: "1px solid var(--cr-rule)", color: "var(--cr-ink-3)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10.5px", padding: "4px 12px", cursor: "pointer" }}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

/**
 * D39: the schedule itself. Each tranche carries the same two one-way
 * confirmations as a single-payment deal; the deal is funded only when the
 * last one is received. The header reports what has actually arrived, which
 * is the number a founder needs and the one a commitment total hides.
 */
function TrancheBlock({ deal, viewAs, initial, onChange, isExternalInv }: {
  deal: Deal; viewAs: "startup" | "investor" | "admin";
  initial: Tranche[]; onChange: (t: Tranche[]) => void; isExternalInv: boolean;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Tranche[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const received = receivedTotal(rows);
  const total = scheduleTotal(rows.map(r => r.amount));
  const allIn = allReceived(rows);

  async function confirm(tr: Tranche, step: "sent" | "received") {
    if (busy) return;
    setBusy(tr.id);
    const res = await fetch("/api/deals/tranches", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId: deal.id, action: "confirm", trancheId: tr.id, step }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { notify.error(j.error || t("errors.generic")); return; }
    const next = rows.map(r => r.id === tr.id ? { ...r, ...(step === "sent" ? { funds_sent_at: new Date().toISOString() } : { funds_received_at: new Date().toISOString() }) } : r);
    setRows(next); onChange(next);
    notify.success(j.fundedAt ? t("tranches.fullyFunded") : t("funding.recorded"));
  }

  const canSend = viewAs === "investor" || (isExternalInv && viewAs === "startup");
  const canReceive = viewAs === "startup";

  return (
    <div style={{ marginTop: "10px", background: allIn ? "var(--cr-up-bg)" : "var(--cr-paper-3)", border: `1px solid ${allIn ? "rgba(45,106,79,0.25)" : "var(--cr-rule-dark)"}`, borderRadius: "4px", padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: allIn ? "var(--cr-up)" : "var(--cr-ink)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {allIn ? t("tranches.fundedTitle") : t("tranches.title")}
        </p>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-4)" }}>
          {t("tranches.receivedOf", { received: formatMoney(received, deal.currency, { compact: true }), total: formatMoney(total, deal.currency, { compact: true }) })}
        </span>
      </div>
      {rows.map((r, i) => (
        <div key={r.id} style={{ padding: "6px 0", borderTop: i === 0 ? "none" : "1px solid var(--cr-rule)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif", fontSize: "11.5px", color: r.funds_received_at ? "var(--cr-up)" : "var(--cr-ink)" }}>
              {r.funds_received_at ? <CheckCircle2 style={{ width: 12, height: 12 }} /> : <Circle style={{ width: 12, height: 12, color: "var(--cr-ink-4)" }} />}
              <span style={{ fontWeight: 600 }}>{r.label || t("tranches.nth", { n: i + 1 })}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10.5px", color: "var(--cr-ink-3)" }}>{formatMoney(Number(r.amount), deal.currency, { compact: true })}</span>
            </span>
            <span style={{ display: "inline-flex", gap: 5 }}>
              {!r.funds_sent_at && canSend && (
                <button onClick={() => confirm(r, "sent")} disabled={busy === r.id}
                  style={{ background: "transparent", border: "1px solid var(--cr-rule-dark)", color: "var(--cr-ink-3)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", padding: "2px 8px", cursor: "pointer" }}>
                  {t("funding.sent")}
                </button>
              )}
              {!r.funds_received_at && canReceive && (
                <button onClick={() => confirm(r, "received")} disabled={busy === r.id}
                  style={{ background: "transparent", border: "1px solid var(--cr-up)", color: "var(--cr-up)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", padding: "2px 8px", cursor: "pointer" }}>
                  {t("funding.received")}
                </button>
              )}
            </span>
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10.5px", color: "var(--cr-ink-4)", marginTop: 2, paddingLeft: 18 }}>
            {r.due_date && <span>{t("tranches.due")}: {formatDate(r.due_date)}</span>}
            {r.due_date && r.condition && " · "}
            {r.condition}
            {r.funds_sent_at && !r.funds_received_at && <span style={{ color: "var(--cr-ink-3)" }}>{(r.due_date || r.condition) ? " · " : ""}{t("tranches.sentAwaiting")}</span>}
          </p>
        </div>
      ))}
      {!allIn && (
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10.5px", color: "var(--cr-down)", marginTop: 7, lineHeight: 1.45 }}>
          {t("funding.fraudWarning")}
        </p>
      )}
    </div>
  );
}

/** C33: opt in to co-investor visibility for one deal. */
function PublicInterestToggle({ deal }: { deal: Deal }) {
  const { t } = useTranslation();
  const [on, setOn] = useState(!!(deal as unknown as { public_interest?: boolean }).public_interest);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (busy) return;
    const next = !on;
    setOn(next); setBusy(true);
    const res = await fetch("/api/deals/interest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId: deal.id, publicInterest: next }) });
    setBusy(false);
    if (!res.ok) { setOn(!next); notify.error(t("errors.generic")); }
  }
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: "7px", marginTop: "8px", cursor: "pointer" }}>
      <input type="checkbox" checked={on} onChange={toggle} disabled={busy} style={{ marginTop: 2, accentColor: "var(--cr-copper)", width: 13, height: 13 }} />
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "11px", color: "var(--cr-ink-3)", lineHeight: 1.45 }}>
        {t("coInvestors.toggle")}
        <span style={{ display: "block", color: "var(--cr-ink-4)", fontWeight: 300, fontSize: "10.5px" }}>{t("coInvestors.toggleHint")}</span>
      </span>
    </label>
  );
}

/**
 * B18: add an investor who will never make an account. They become a
 * contact only this startup can see, and (optionally) a deal on the board
 * straight away, so the raise total finally includes the angel from the
 * founder's own network.
 */
function ExternalInvestorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [firm, setFirm] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEscapeKey(true, onClose);

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const amt = Number(amount.replace(/[^0-9.]/g, ""));
    const res = await fetch("/api/investors/external", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, firm: firm || undefined, email: email || undefined, note: note || undefined, openDeal: true, amount: Number.isFinite(amt) && amt > 0 ? amt : undefined }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { notify.error(j.error || t("errors.generic")); return; }
    notify.success(t("external.added"));
    onCreated(); onClose();
  }

  const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink)", padding: "9px 11px", outline: "none" };
  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(26,22,18,0.55)", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="animate-fade-up"
        style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: 6, width: "100%", maxWidth: 420, padding: 24 }}>
        <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 20, color: "var(--cr-ink)", marginBottom: 4 }}>{t("external.title")}</h3>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 12.5, color: "var(--cr-ink-3)", marginBottom: 16, lineHeight: 1.5 }}>{t("external.intro")}</p>
        <div style={{ display: "grid", gap: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("external.namePh")} autoFocus maxLength={120} style={input} />
          <input value={firm} onChange={(e) => setFirm(e.target.value)} placeholder={t("external.firmPh")} maxLength={120} style={input} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("external.emailPh")} maxLength={254} style={input} />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={t("external.amountPh")} style={input} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={t("external.notePh")} maxLength={1000} style={{ ...input, resize: "vertical" }} />
        </div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 11, color: "var(--cr-ink-4)", margin: "10px 0 0", lineHeight: 1.5 }}>{t("external.privacyNote")}</p>
        <div className="flex flex-col-reverse sm:flex-row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={{ height: 40, padding: "0 16px", background: "transparent", border: "1px solid var(--cr-rule-dark)", borderRadius: 4, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 13, color: "var(--cr-ink-3)", cursor: "pointer" }}>{t("common.cancel")}</button>
          <button onClick={submit} disabled={!name.trim() || busy} className="btn-copper-shimmer"
            style={{ height: 40, padding: "0 20px", background: "var(--cr-copper)", border: "none", borderRadius: 4, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: "#fff", cursor: "pointer", opacity: !name.trim() || busy ? 0.5 : 1 }}>
            {busy ? t("common.saving") : t("external.add")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Activity section (inside a deal card) ──────────────────────────────────────

const ACTIVITY_ICON_KEY: Record<DealActivity["type"], string> = {
  note:            "deals.activityNote",
  status_change:   "deals.activityStatusChange",
  contract_status: "deals.activityContractStatus",
  nda_signed:      "deals.activityNdaSigned",
  // The success-fee invoice. Typed as a Record over the union deliberately --
  // adding the variant to DealActivityType made the compiler point straight at
  // this map, which is how it should work.
  success_fee:     "deals.activitySuccessFee",
  // The first line of every investor-opened deal: the timestamped record that
  // the 2% terms were accepted before contact (see circumvention_acks).
  circumvention_acknowledged: "deals.activityCircumventionAck",
};

/**
 * Structured due diligence on the deal (migration 041): add items, tick them
 * off. RLS inherits deal visibility, so both sides and team members share
 * the same list.
 */
// Suggested per-stage checklist items — turns stage movement from a label
// change into a guided process. One click seeds them; every item stays
// editable/removable like any hand-added one.
const STAGE_CHECKLIST_KEYS: Record<string, string[]> = {
  intro:         ["deals.ckIntro1", "deals.ckIntro2", "deals.ckIntro3", "deals.ckIntro4"],
  due_diligence: ["deals.ckDd1", "deals.ckDd2", "deals.ckDd3", "deals.ckDd4"],
  term_sheet:    ["deals.ckTs1", "deals.ckTs2", "deals.ckTs3", "deals.ckTs4"],
};

type ChecklistItem = { id: string; label: string; done: boolean; due_date?: string | null; owner_side?: string | null; evidence?: string | null };

function ChecklistSection({ dealId, stage, viewAs, onOpenCount }: { dealId: string; stage: string; viewAs?: "startup" | "investor" | "admin"; onOpenCount?: (n: number) => void }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [label, setLabel] = useState("");
  // C30: reusable templates, saved per investor and applied in one action.
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; items: unknown[] }>>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    if (viewAs !== "investor") return;
    fetch("/api/checklist-templates").then(r => r.ok ? r.json() : null).then(j => setTemplates(j?.templates ?? [])).catch(() => {});
  }, [viewAs]);

  async function applyTemplate(templateId: string) {
    const res = await fetch("/api/deals/checklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, templateId }) });
    const j = await res.json().catch(() => null);
    if (!res.ok) { notify.error(j?.error || t("errors.generic")); return; }
    setItems(prev => [...(prev ?? []), ...((j?.items ?? []) as ChecklistItem[])]);
    notify.success(t("checklist.templateApplied"));
  }
  async function saveAsTemplate() {
    const list = items ?? [];
    if (!list.length) return;
    const name = window.prompt(t("checklist.templateNamePrompt"));
    if (!name?.trim()) return;
    const res = await fetch("/api/checklist-templates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, items: list.map(i => ({ label: i.label, owner_side: i.owner_side ?? undefined })) }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.template) { notify.error(j?.error || t("errors.generic")); return; }
    setTemplates(prev => [j.template, ...prev]);
    notify.success(t("checklist.templateSaved"));
  }
  async function patchItem(id: string, patch: { dueDate?: string | null; ownerSide?: string | null; evidence?: string | null }) {
    const key = patch.dueDate !== undefined ? "due_date" : patch.ownerSide !== undefined ? "owner_side" : "evidence";
    const val = patch.dueDate ?? patch.ownerSide ?? patch.evidence ?? null;
    setItems(prev => prev?.map(i => i.id === id ? { ...i, [key]: val } : i) ?? prev);
    const res = await fetch("/api/deals/checklist", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    if (!res.ok) notify.error(t("errors.generic"));
  }

  useEffect(() => {
    fetch(`/api/deals/checklist?dealId=${dealId}`).then(r => r.ok ? r.json() : null)
      .then(j => setItems(j?.items ?? [])).catch(() => setItems([]));
  }, [dealId]);

  async function add() {
    if (!label.trim()) return;
    const res = await fetch("/api/deals/checklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, label }) });
    const j = await res.json().catch(() => null);
    if (res.ok && j?.item) { setItems(prev => [...(prev ?? []), j.item]); setLabel(""); }
  }
  async function toggle(id: string, done: boolean) {
    setItems(prev => prev?.map(i => i.id === id ? { ...i, done } : i) ?? prev);
    try {
      const res = await fetch("/api/deals/checklist", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, done }) });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev => prev?.map(i => i.id === id ? { ...i, done: !done } : i) ?? prev);
      notify.error(t("errors.generic"));
    }
  }
  async function remove(id: string) {
    const removed = items?.find(i => i.id === id);
    setItems(prev => prev?.filter(i => i.id !== id) ?? prev);
    try {
      const res = await fetch("/api/deals/checklist", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error();
    } catch {
      if (removed) setItems(prev => [...(prev ?? []), removed]);
      notify.error(t("errors.generic"));
    }
  }

  const doneCount = (items ?? []).filter(i => i.done).length;
  const openCount = (items ?? []).length - doneCount;
  useEffect(() => { onOpenCount?.(items === null ? 0 : openCount); }, [openCount, items, onOpenCount]);

  const [seeding, setSeeding] = useState(false);
  async function seedStageChecklist() {
    const keys = STAGE_CHECKLIST_KEYS[stage] ?? [];
    if (!keys.length || seeding) return;
    setSeeding(true);
    try {
      for (const k of keys) {
        const res = await fetch("/api/deals/checklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId, label: t(k) }) });
        const j = await res.json().catch(() => null);
        if (res.ok && j?.item) setItems(prev => [...(prev ?? []), j.item]);
      }
    } finally { setSeeding(false); }
  }

  return (
    <div style={{ marginTop: "12px", borderTop: "1px solid var(--cr-rule)", paddingTop: "10px" }}>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>
        {t("deals.checklist")}{items && items.length > 0 ? ` · ${doneCount}/${items.length}` : ""}
      </p>
      {items !== null && items.length === 0 && STAGE_CHECKLIST_KEYS[stage] && (
        <button onClick={seedStageChecklist} disabled={seeding}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", background: "var(--cr-copper-bg)", border: "1px dashed var(--cr-copper-br)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", padding: "7px 0", cursor: "pointer", marginBottom: "8px", opacity: seeding ? 0.6 : 1 }}>
          <Plus style={{ width: 11, height: 11 }} /> {seeding ? t("common.saving") : t("deals.seedChecklist")}
        </button>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {(items ?? []).map(i => {
          const overdue = !i.done && i.due_date && new Date(i.due_date) < new Date();
          return (
          <div key={i.id}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input type="checkbox" checked={i.done} onChange={e => toggle(i.id, e.target.checked)} style={{ accentColor: "var(--cr-copper)" }} />
              <button onClick={() => setExpanded(x => x === i.id ? null : i.id)}
                style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: i.done ? "var(--cr-ink-4)" : "var(--cr-ink-2)", textDecoration: i.done ? "line-through" : "none" }}>
                {i.label}
                {i.owner_side && <span style={{ marginLeft: 6, fontSize: "9.5px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--cr-ink-4)" }}>{i.owner_side === "startup" ? t("checklist.ownerStartup") : t("checklist.ownerInvestor")}</span>}
                {i.due_date && <span style={{ marginLeft: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: overdue ? "var(--cr-down)" : "var(--cr-ink-4)" }}>{i.due_date}</span>}
              </button>
              <button onClick={() => remove(i.id)} aria-label={`remove ${i.label}`}
                style={{ background: "none", border: "none", color: "var(--cr-ink-4)", cursor: "pointer", fontSize: "12px", lineHeight: 1, padding: 0 }}>×</button>
            </div>
            {expanded === i.id && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", padding: "6px 0 8px 24px" }}>
                <select value={i.owner_side ?? ""} onChange={e => patchItem(i.id, { ownerSide: e.target.value || null })} aria-label={t("checklist.owner")}
                  style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontSize: "10.5px", color: "var(--cr-ink-3)", padding: "3px 5px" }}>
                  <option value="">{t("checklist.owner")}</option>
                  <option value="investor">{t("checklist.ownerInvestor")}</option>
                  <option value="startup">{t("checklist.ownerStartup")}</option>
                </select>
                <input type="date" value={i.due_date ?? ""} onChange={e => patchItem(i.id, { dueDate: e.target.value || null })} aria-label={t("checklist.due")}
                  style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--cr-ink-3)", padding: "2px 5px" }} />
                <input defaultValue={i.evidence ?? ""} placeholder={t("checklist.evidencePh")} maxLength={500}
                  onBlur={e => { if ((e.target.value || null) !== (i.evidence ?? null)) patchItem(i.id, { evidence: e.target.value }); }}
                  style={{ flex: 1, minWidth: 120, background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink)", padding: "3px 7px", outline: "none" }} />
              </div>
            )}
          </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
        <input value={label} onChange={e => setLabel(e.target.value)} maxLength={200} placeholder={t("deals.addItem")}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          style={{ flex: 1, background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink)", padding: "6px 9px", outline: "none" }} />
        <button onClick={add} disabled={!label.trim()}
          style={{ border: "1px solid var(--cr-copper-br)", background: "transparent", color: "var(--cr-copper)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", padding: "6px 10px", cursor: "pointer", opacity: label.trim() ? 1 : 0.5 }}>
          {t("deals.checkAdd")}
        </button>
      </div>
      {viewAs === "investor" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginTop: "8px" }}>
          {templates.length > 0 && (
            <select defaultValue="" onChange={e => { if (e.target.value) { applyTemplate(e.target.value); e.target.value = ""; } }} aria-label={t("checklist.applyTemplate")}
              style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-3)", padding: "4px 6px", cursor: "pointer" }}>
              <option value="">{t("checklist.applyTemplate")}</option>
              {templates.map(tp => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
            </select>
          )}
          {(items ?? []).length > 0 && (
            <button onClick={saveAsTemplate}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)" }}>
              {t("checklist.saveAsTemplate")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ActivitySection({ dealId }: { dealId: string }) {
  const { t } = useTranslation();
  const [open, setOpen]         = useState(false);
  const [loaded, setLoaded]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [activity, setActivity] = useState<DealActivity[]>([]);
  const [note, setNote]         = useState("");
  const [posting, setPosting]   = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/deals/activity?dealId=${dealId}`);
      const data = await res.json();
      if (res.ok) setActivity(data.activity || []);
    } catch { /* section shows its empty state */ } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) load();
  }

  async function handleAddNote() {
    if (!note.trim()) return;
    setPosting(true);
    const res = await fetch("/api/deals/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId, body: note.trim() }),
    });
    const data = await res.json();
    setPosting(false);
    if (!res.ok) { notify.error(data.error || t("deals.noteAddFailed")); return; }
    setActivity(prev => [data.entry, ...prev]);
    setNote("");
  }

  return (
    <div style={{ marginTop: "10px", borderTop: "1px solid var(--cr-rule)", paddingTop: "10px" }}>
      <button onClick={toggle}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: "0" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "5px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {t("deals.activity")}{loaded && activity.length > 0 ? ` (${activity.length})` : ""}
        </span>
        <ChevronDown style={{ width: 13, height: 13, color: "var(--cr-ink-4)", transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
      </button>

      {open && (
        <div style={{ marginTop: "10px" }}>
          {loading && <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>…</p>}
          {!loading && loaded && activity.length === 0 && (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "8px" }}>{t("deals.noActivity")}</p>
          )}
          {!loading && activity.map(a => (
            <div key={a.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--cr-rule)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)" }}>
                  {t(ACTIVITY_ICON_KEY[a.type])}
                  {a.actor?.full_name ? ` · ${a.actor.full_name}` : ""}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", flexShrink: 0 }}>
                  {formatDate(a.created_at)}
                </span>
              </div>
              {a.body && (
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink)", marginTop: "2px" }}>{a.body}</p>
              )}
            </div>
          ))}

          <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder={t("deals.addNotePlaceholder")}
              onKeyDown={e => { if (e.key === "Enter") handleAddNote(); }}
              style={{ flex: 1, background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink)", padding: "7px 9px", outline: "none", boxSizing: "border-box" }} />
            <button onClick={handleAddNote} disabled={!note.trim() || posting}
              style={{ background: "var(--cr-copper)", border: "none", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "#fff", padding: "0 12px", cursor: !note.trim() || posting ? "default" : "pointer", opacity: !note.trim() || posting ? 0.5 : 1 }}>
              {posting ? t("deals.posting") : t("deals.addNote")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Passed-reason picker ────────────────────────────────────────────────────────

const PASSED_REASONS = [
  { key: "stage_mismatch", labelKey: "deals.passedReasonStage" },
  { key: "valuation",      labelKey: "deals.passedReasonValuation" },
  { key: "timing",         labelKey: "deals.passedReasonTiming" },
  { key: "no_response",    labelKey: "deals.passedReasonNoResponse" },
  { key: "other",          labelKey: "deals.passedReasonOther" },
];

function PassedReasonPicker({ onConfirm, onCancel }: { onConfirm: (reason: string) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail]     = useState("");

  const canConfirm = !!selected && (selected !== "other" || detail.trim().length > 0);

  function handleConfirm() {
    if (!canConfirm || !selected) return;
    const label = t(PASSED_REASONS.find(r => r.key === selected)!.labelKey);
    onConfirm(selected === "other" ? detail.trim() : label);
  }

  return (
    <div style={{ marginTop: "10px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "12px 14px" }}>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-down)", marginBottom: "8px" }}>{t("deals.whyPassed")}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "8px" }}>
        {PASSED_REASONS.map(r => (
          <button key={r.key} onClick={() => setSelected(r.key)}
            style={{
              background: selected === r.key ? "var(--cr-copper)" : "var(--cr-paper-2)",
              border: `1px solid ${selected === r.key ? "var(--cr-copper)" : "var(--cr-rule-dark)"}`,
              borderRadius: "12px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px",
              color: selected === r.key ? "#fff" : "var(--cr-ink-3)", padding: "5px 11px", cursor: "pointer",
            }}>
            {t(r.labelKey)}
          </button>
        ))}
      </div>
      {selected === "other" && (
        <input type="text" value={detail} onChange={e => setDetail(e.target.value)} placeholder={t("deals.passedReasonOtherPlaceholder")}
          autoFocus
          style={{ width: "100%", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink)", padding: "7px 9px", outline: "none", boxSizing: "border-box", marginBottom: "8px" }} />
      )}
      <div style={{ display: "flex", gap: "6px" }}>
        <button onClick={handleConfirm} disabled={!canConfirm}
          style={{ flex: 1, height: "32px", background: "var(--cr-down)", border: "none", borderRadius: "3px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "#fff", cursor: canConfirm ? "pointer" : "default", opacity: canConfirm ? 1 : 0.5 }}>
          {t("deals.confirmPass")}
        </button>
        <button onClick={onCancel} aria-label={t("common.close")}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex", alignItems: "center" }}>
          <X style={{ width: 15, height: 15 }} />
        </button>
      </div>
    </div>
  );
}

// ── Deal card ─────────────────────────────────────────────────────────────────

function DealCard({ deal, viewAs, onStatusChange, onDealClose, revealIdentity = true, equityOffered = null, onSetFollowUp, onSetCommitment }: {
  deal: Deal;
  viewAs: "startup" | "investor" | "admin";
  onStatusChange?: (id: string, status: DealStatus, reason?: string) => void;
  onDealClose?: (id: string, amount: number, currency: string) => void;
  revealIdentity?: boolean;
  equityOffered?: number | null;
  onSetFollowUp?: (id: string, date: string | null) => void;
  onSetCommitment?: (id: string, commitmentType: CommitmentType, amount?: number | null) => void;
}) {
  const { t } = useTranslation();
  const columns = useColumns();
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [editingFollowUp, setEditingFollowUp] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState(deal.next_follow_up || "");
  const [closeAmount, setCloseAmount]     = useState(deal.close_proposed_amount != null ? String(deal.close_proposed_amount) : deal.amount ? String(deal.amount) : "");
  const [closeCurrency, setCloseCurrency] = useState(deal.close_proposed_currency || deal.currency || DEFAULT_CURRENCY);
  const [closing, setClosing]             = useState(false);
  const [showPassedPicker, setShowPassedPicker] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(0);
  const [pendingMove, setPendingMove] = useState<DealStatus | null>(null);
  const [expanded, setExpanded] = useState(false);

  const { investorName, startupName } = dealNames(deal, t);
  // B18: an off-platform contact has no account — anything that needs one
  // (messaging, notifications) is hidden rather than offered and broken.
  const isExternal = !!(deal.investor as unknown as { is_external?: boolean } | null)?.is_external;

  const realName = viewAs === "admin" ? `${startupName} × ${investorName}`
    : viewAs === "startup" ? investorName
    : startupName;

  const masked = viewAs === "startup" && !revealIdentity;
  const name   = masked ? t("deals.interestedInvestor") : realName;

  // Pipeline -> profile, the return leg of the profile's "in your pipeline"
  // pill. Both slugs are already in the query; the name was just dead text.
  // No link while masked (the whole point is not knowing who), none for the
  // admin composite name.
  // An external contact has no public profile to link to (RLS hides the row
  // from everyone but this startup), so the name stays plain text.
  const counterpartHref = masked || viewAs === "admin" ? null
    : viewAs === "startup" ? (deal.investor?.slug && !isExternal ? `/investors/${deal.investor.slug}` : null)
    : (deal.startup?.slug ? `/startups/${deal.startup.slug}` : null);

  const isActive = deal.status !== "closed" && deal.status !== "passed";

  async function handleClose() {
    if (!onDealClose) return;
    setClosing(true);
    await onDealClose(deal.id, parseFloat(closeAmount) || 0, closeCurrency);
    setClosing(false);
    setShowCloseForm(false);
  }

  return (
    <div id={`deal-${deal.id}`} style={{
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
        {counterpartHref ? (
          <Link href={counterpartHref} style={{ color: "inherit", textDecoration: "none", borderBottom: "1px dotted var(--cr-ink-4)" }}>
            {name}
          </Link>
        ) : name}
        {/* B18: say plainly that this one is not on the platform. */}
        {isExternal && (
          <span style={{ flexShrink: 0, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "9px", letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--cr-ink-4)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", padding: "1px 5px" }}>
            {t("external.badge")}
          </span>
        )}
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
      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
        {formatDate(deal.updated_at)}

        {/* Time in the current stage, which is the question a pipeline review
            actually asks -- not "what stage" but "how long has it been there".
            updated_at can't answer it: a note or a contract bumps that without
            the stage moving, so a deal stuck for months looks freshly touched. */}
        {isActive && deal.stage_entered_at && (() => {
          // Per-stage service levels: how long a deal may sit in a stage
          // before the age itself is the finding. Intro conversations go cold
          // in two weeks; diligence legitimately takes a month; a term sheet
          // unsigned for three weeks is a term sheet being shopped or
          // ignored. Copper past the threshold, red past double -- the same
          // escalation grammar the rest of the pipeline uses.
          const SLA_DAYS: Record<string, number> = { intro: 14, due_diligence: 30, term_sheet: 21 };
          const days = daysSince(deal.stage_entered_at);
          const sla = SLA_DAYS[deal.status] ?? 30;
          const over = days > sla;
          const critical = days > sla * 2;
          return (
            <span style={{
              fontFamily: "'DM Sans', sans-serif", fontWeight: over ? 600 : 500, fontSize: "10px",
              color: critical ? "var(--cr-down)" : over ? "var(--cr-copper)" : "var(--cr-ink-3)",
              background: critical ? "var(--cr-down-bg)" : over ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
              border: critical ? "1px solid rgba(180,50,50,0.2)" : over ? "1px solid var(--cr-copper-br)" : "none",
              borderRadius: "3px", padding: "1px 6px",
            }}>
              {t("deals.inStageFor", { n: days })}
            </span>
          );
        })()}

        {isActive && daysSince(deal.updated_at) > 21 && (
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-down)", background: "var(--cr-down-bg)", border: "1px solid rgba(180,50,50,0.2)", borderRadius: "3px", padding: "1px 6px" }}>
            {t("deals.staleBadge", { n: daysSince(deal.updated_at) })}
          </span>
        )}
      </p>

      {/* Quick-move buttons */}
      {onStatusChange && isActive && !showPassedPicker && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "10px" }}>
          {QUICK_MOVE.filter(s => s !== deal.status).map((s) => (
            <button key={s} onClick={() => {
                if (s === "passed") { setShowPassedPicker(true); return; }
                // Soft gate: open checklist items are a nudge, not a wall. The
                // first click warns; a second click within the same render
                // moves anyway. Passing is never gated.
                if (checklistOpen > 0 && pendingMove !== s) {
                  setPendingMove(s);
                  notify.info(t("deals.checklistOpenWarn", { n: String(checklistOpen) }));
                  return;
                }
                setPendingMove(null);
                onStatusChange(deal.id, s);
              }}
              style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: pendingMove === s ? 600 : 400, fontSize: "11px", color: "var(--cr-copper)", padding: "0", textDecoration: "underline" }}>
              → {columns.find(c => c.status === s)?.label}{pendingMove === s ? ` (${t("deals.clickAgain")})` : ""}
            </button>
          ))}
        </div>
      )}

      {/* Reopen. A passed deal was previously terminal, but counterparties
          re-engage all the time and the only way back was to create a second
          deal against the same pair -- which the one-open-deal rule then had to
          allow, muddying the history. Closed stays terminal on purpose: it has
          raised an invoice. */}
      {onStatusChange && deal.status === "passed" && (
        <div style={{ marginTop: "10px" }}>
          <button onClick={() => onStatusChange(deal.id, "intro")}
            style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "11px", color: "var(--cr-copper)", padding: "0", textDecoration: "underline" }}>
            ↺ {t("deals.reopen")}
          </button>
        </div>
      )}

      {/* Outcome dates. closed_at / passed_at are written now, so a concluded
          deal can say when rather than just that. */}
      {(deal.closed_at || deal.passed_at) && (
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", marginTop: "8px" }}>
          {deal.closed_at
            ? t("deals.closedOn", { date: formatDate(deal.closed_at) })
            : t("deals.passedOn", { date: formatDate(deal.passed_at as string) })}
          {deal.closed_at && deal.amount
            ? ` · ${formatMoney(Number(deal.amount), deal.currency || DEFAULT_CURRENCY)}`
            : ""}
          {deal.success_fee_amount
            ? ` · ${t("deals.feeBilled", { amount: formatMoney(deal.success_fee_amount / 100, deal.currency || DEFAULT_CURRENCY) })}`
            : ""}
        </p>
      )}

      {showPassedPicker && onStatusChange && (
        <PassedReasonPicker
          onConfirm={reason => { onStatusChange(deal.id, "passed", reason); setShowPassedPicker(false); }}
          onCancel={() => setShowPassedPicker(false)}
        />
      )}

      {/* Everything below is the work you do ON a deal rather than the
          state OF it. Rendered on every card, it made each one three to four
          hundred pixels tall — a column of five ran past the fold and the
          board stopped reading as a board. It also meant six data-fetching
          sections mounting per card, so opening the page fired dozens of
          requests for panels nobody had looked at.

          Collapsed by default. The card shows who, how much, and how long it
          has been sitting; the rest opens on demand. */}
      <button onClick={() => setExpanded(v => !v)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: "10px",
          fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)",
          display: "flex", alignItems: "center", gap: "4px" }}
        aria-expanded={expanded}>
        <ChevronDown style={{ width: 12, height: 12, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 120ms" }} />
        {expanded ? t("deals.hideDetails") : t("deals.showDetails")}
      </button>

      {expanded && (
        <>
      {/* C33: let other investors see you are looking at this company.
          Off by default, investor-side only, never shows the amount. */}
      {viewAs === "investor" && isActive && <PublicInterestToggle deal={deal} />}

      {/* B17: commitment level — "we're in for X". Both sides can set it;
          the raise tracker on the founder dashboard reads it from day 0. */}
      {onSetCommitment && isActive && (() => {
        const ct = ((deal as unknown as { commitment_type?: string | null }).commitment_type ?? "interest") as CommitmentType;
        const chipStyle = (active: boolean): React.CSSProperties => ({
          fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", padding: "3px 8px", borderRadius: "999px", cursor: "pointer",
          background: active ? "var(--cr-copper)" : "var(--cr-paper-2)", color: active ? "#fff" : "var(--cr-ink-3)",
          border: `1px solid ${active ? "var(--cr-copper)" : "var(--cr-rule-dark)"}`,
        });
        return (
          <div style={{ marginTop: "8px" }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>{t("deals.commitmentLabel")}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              <InfoTip termKey="glossary.softCircle" />
              {(["interest", "soft_circle", "verbal", "committed"] as CommitmentType[]).map((c) => (
                <button key={c} onClick={() => { if (c !== ct) onSetCommitment(deal.id, c); }} style={chipStyle(c === ct)} aria-pressed={c === ct}>
                  {t(COMMITMENT_KEY[c])}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Follow-up date */}
      {onSetFollowUp && (
        <div style={{ marginTop: "6px" }}>
          {editingFollowUp ? (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <input type="date" value={followUpDraft} onChange={e => setFollowUpDraft(e.target.value)}
                style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink)", padding: "4px 6px", outline: "none" }} />
              <button onClick={() => { onSetFollowUp(deal.id, followUpDraft || null); setEditingFollowUp(false); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", textDecoration: "underline" }}>
                {t("deals.save")}
              </button>
              {deal.next_follow_up && (
                <button onClick={() => { onSetFollowUp(deal.id, null); setFollowUpDraft(""); setEditingFollowUp(false); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex", alignItems: "center" }}>
                  <X style={{ width: 12, height: 12 }} />
                </button>
              )}
            </div>
          ) : deal.next_follow_up ? (
            <button onClick={() => setEditingFollowUp(true)}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "11px", color: new Date(deal.next_follow_up) < new Date() ? "var(--cr-down)" : "var(--cr-copper)", padding: "0", textDecoration: "underline" }}>
              {t("deals.followUpLabel", { date: formatDate(deal.next_follow_up) })}
            </button>
          ) : (
            <button onClick={() => setEditingFollowUp(true)}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "11px", color: "var(--cr-ink-4)", padding: "0", textDecoration: "underline" }}>
              {t("deals.setFollowUp")}
            </button>
          )}
        </div>
      )}
        </>
      )}

      {/* A pending close proposal — both sides must agree before the fee fires. */}
      {isActive && onDealClose && !showCloseForm && deal.close_proposed_at && (
        <div style={{ marginTop: "10px", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "10px 12px" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)", marginBottom: "2px" }}>
            {t("deals.closeProposedAt", { amount: formatMoney(Number(deal.close_proposed_amount ?? 0), deal.close_proposed_currency || deal.currency || DEFAULT_CURRENCY) })}
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", marginBottom: "8px" }}>{t("deals.closeProposedHint")}</p>
          <button onClick={() => setShowCloseForm(true)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", background: "var(--cr-up)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "#fff", padding: "7px 0", cursor: "pointer" }}>
            <CheckCircle2 style={{ width: 12, height: 12 }} /> {t("deals.reviewClose")}
          </button>
        </div>
      )}

      {/* Close deal */}
      {isActive && onDealClose && !showCloseForm && !deal.close_proposed_at && (
        <button onClick={() => setShowCloseForm(true)}
          style={{ marginTop: "10px", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.25)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-up)", padding: "7px 0", cursor: "pointer" }}>
          <CheckCircle2 style={{ width: 12, height: 12 }} /> {t("deals.closeDeal")}
        </button>
      )}

      {/* Close form */}
      {showCloseForm && (
        <div style={{ marginTop: "10px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "12px 14px" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-up)", marginBottom: "8px" }}>{deal.close_proposed_at ? t("deals.confirmClose") : t("deals.proposeClose")}</p>
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
          {/* The exact invoice, live, before the click that triggers it.
              Nobody should learn the number from the invoice email. */}
          {parseFloat(closeAmount) > 0 && (
            <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "3px", padding: "6px 10px", marginBottom: "8px" }}>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)" }}>
                {t("deals.feePreview", { fee: formatMoney(parseFloat(closeAmount) * 0.02, closeCurrency) })}
              </p>
              {/* Value framing (Phase 1, mechanism D): the same number next to
                  what a broker would have taken makes 2% read as the cheap
                  option at the exact moment the fee is triggered. */}
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "10.5px", color: "var(--cr-ink-3)", marginTop: "3px" }}>
                {t("feeCalc.rowBroker", { fee: 6 })}: <s>{formatMoney(parseFloat(closeAmount) * 0.06, closeCurrency)}</s>
                {" · "}{t("feeCalc.rowSave")}: <span style={{ color: "var(--cr-up)", fontWeight: 500 }}>{formatMoney(parseFloat(closeAmount) * 0.04, closeCurrency)}</span>
              </p>
            </div>
          )}
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", marginBottom: "6px" }}>
            {t("deals.feeNotice")}
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", marginBottom: "10px", lineHeight: 1.5 }}>
            {t("deals.moneyWorks")}
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

      {expanded && (
        <>
      {/* D37: closed → funded. */}
      {deal.status === "closed" && <FundingBlock deal={deal} viewAs={viewAs} />}

      {deal.success_fee_invoiced && (
        <span style={{ display: "inline-block", marginTop: "8px", background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.25)", color: "var(--cr-up)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "2px 7px" }}>
          {t("deals.invoiceSent")}
        </span>
      )}

      {viewAs !== "admin" && !isExternal && (
        <a href={`/dashboard/messages?startupId=${deal.startup_id}&investorId=${deal.investor_id}`}
          style={{ display: "inline-block", marginTop: "8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", textDecoration: "underline" }}>
          {t("deals.messageCounterpart")}
        </a>
      )}

      <ResourcesSection dealId={deal.id} startupId={deal.startup_id} viewAs={viewAs} />
      <ContractsSection
        dealId={deal.id}
        dealAmount={deal.amount}
        dealCurrency={deal.currency}
        equityOffered={viewAs === "startup" ? equityOffered : deal.startup?.equity_offered ?? null}
        startupId={deal.startup_id}
        investorId={deal.investor_id}
      />
        </>
      )}

      <div style={{ display: expanded ? "block" : "none" }}>
        <ChecklistSection dealId={deal.id} stage={deal.status} viewAs={viewAs} onOpenCount={setChecklistOpen} />
      </div>
      <ActivitySection dealId={deal.id} />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

type SortKey = "updated_desc" | "amount_desc" | "amount_asc" | "created_desc" | "follow_up_due" | "stage_age";
const SORT_OPTIONS: { key: SortKey; labelKey: string }[] = [
  { key: "updated_desc", labelKey: "deals.sortRecent" },
  { key: "amount_desc",  labelKey: "deals.sortAmountDesc" },
  { key: "amount_asc",   labelKey: "deals.sortAmountAsc" },
  { key: "created_desc", labelKey: "deals.sortNewest" },
  { key: "follow_up_due", labelKey: "deals.sortFollowUp" },
  // Surfaces whatever has been sitting untouched the longest, which is the
  // thing a pipeline review is trying to find.
  { key: "stage_age",    labelKey: "deals.sortStageAge" },
];

function csvEscape(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

export function DealKanban({ deals, onStatusChange, onDealClose, viewAs, revealIdentity = true, equityOffered = null, ownProfile, canExport = false, onSetFollowUp, onSetCommitment , onProposalsChanged }: DealKanbanProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const columns = useColumns();
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [showExternal, setShowExternal] = useState(false);
  const [search, setSearch]           = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  // Lifecycle filter: the question "which deals are still ALIVE?" deserved
  // better than reading column headers. Active = neither closed nor passed.
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "closed" | "passed">("all");
  const [sortKey, setSortKey]         = useState<SortKey>("updated_desc");
  const [viewMode, setViewMode]       = useState<"kanban" | "list">("kanban");
  const [expandedCols, setExpandedCols] = useState<Set<string>>(new Set());

  // On a phone the kanban is ~1400px of horizontal scroll for five columns;
  // the list view was built for exactly this shape. Default narrow screens to
  // it once on mount -- an effect rather than a state initializer so the
  // server and client first render identically (no hydration mismatch), and
  // only ever flipping the initial default, never a choice the user has made.
  useEffect(() => {
    // An explicit choice, once made, outranks the width heuristic entirely.
    const saved = localStorage.getItem("cr-deals-view");
    if (saved === "kanban" || saved === "list") { setViewMode(saved); return; }
    // innerWidth reads 0 in hidden/prerendered tabs, and 0 < 640 would flip
    // a desktop that merely started in the background. Only trust a real
    // positive width.
    const w = window.innerWidth;
    if (w > 0 && w < 640) setViewMode("list");
  }, []);

  function chooseView(v: "kanban" | "list") {
    setViewMode(v);
    try { localStorage.setItem("cr-deals-view", v); } catch { /* private mode */ }
  }

  // /deals?deal=<id> -- the address a notification carries. Every bell entry
  // used to land on the bare board, leaving the reader to hunt through the
  // columns for whichever deal the notification was about. Scroll it into
  // view and pulse a copper ring; done through the DOM rather than prop
  // threading because the same element id exists in both the kanban and the
  // list rendering.
  const focusDealId = useSearchParams().get("deal");
  useEffect(() => {
    if (!focusDealId) return;
    // The deals arrive from an async fetch after mount, so a one-shot delay
    // races the data. Poll briefly until the card exists; give up after ~6s,
    // which also covers "filtered out" and "not this user's deal".
    let tries = 0;
    const iv = setInterval(() => {
      const el = document.getElementById(`deal-${focusDealId}`);
      if (!el) { if (++tries > 20) clearInterval(iv); return; }
      clearInterval(iv);
      // behavior "auto", not "smooth": with nested scrollable ancestors
      // (the kanban column scrolls vertically inside the page) Chrome only
      // animates the nearest one, so the column scrolled internally and the
      // window never moved. Instant scroll walks every ancestor reliably.
      el.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
      el.style.transition = "box-shadow 300ms ease";
      el.style.boxShadow = "0 0 0 2px var(--cr-copper)";
      setTimeout(() => { el.style.boxShadow = ""; }, 2600);
    }, 300);
    return () => clearInterval(iv);
  }, [focusDealId]);

  // Pipeline stats reflect the full, unfiltered deal list — a stable snapshot,
  // not scoped to whatever the filter bar currently shows.
  const stats = useMemo(() => {
    const active = deals.filter(d => d.status !== "closed" && d.status !== "passed");
    const closedCount = deals.filter(d => d.status === "closed").length;
    const passedCount = deals.filter(d => d.status === "passed").length;
    const closeRate = closedCount + passedCount > 0 ? closedCount / (closedCount + passedCount) : null;
    const byCurrency = new Map<string, number>();
    for (const d of active) {
      if (d.amount != null) {
        const cur = d.currency || DEFAULT_CURRENCY;
        byCurrency.set(cur, (byCurrency.get(cur) || 0) + d.amount);
      }
    }
    // Velocity: median days from open to conclusion, and how long the
    // still-open deals have been sitting. Median rather than mean so one
    // forgotten deal from March doesn't define the number.
    const median = (xs: number[]) => {
      if (xs.length === 0) return null;
      const s = [...xs].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
    };
    const DAY = 86_400_000;
    const concludedDays = deals
      .filter(d => d.closed_at || d.passed_at)
      .map(d => Math.round((new Date((d.closed_at ?? d.passed_at)!).getTime() - new Date(d.created_at).getTime()) / DAY))
      .filter(n => n >= 0);
    const openDays = active.map(d => Math.round((Date.now() - new Date(d.created_at).getTime()) / DAY));

    return {
      activeCount: active.length,
      totalCount: deals.length,
      byCurrency,
      closeRate,
      medianCycle: median(concludedDays),
      medianAge: median(openDays),
    };
  }, [deals]);

  // The dimension available to filter by depends on which side is viewing:
  // startups filter by the investor's type, investors/admin filter by the
  // startup's stage (both already present via the joins in app/deals/page.tsx).
  const filterOptions = useMemo(() => {
    const values = new Set<string>();
    deals.forEach(d => {
      const v = viewAs === "startup" ? d.investor?.type : d.startup?.stage;
      if (v) values.add(v);
    });
    return Array.from(values);
  }, [deals, viewAs]);

  const chipLabel = (v: string) =>
    viewAs === "startup"
      ? (INVESTOR_TYPE_KEYS[v] ? t(INVESTOR_TYPE_KEYS[v]) : v.replace(/_/g, " "))
      : (STAGE_LABELS[v] ?? v.replace(/_/g, " "));

  const filteredDeals = useMemo(() => {
    let list = deals;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(d => {
        const { investorName, startupName } = dealNames(d, t);
        const name = viewAs === "startup" ? investorName : viewAs === "investor" ? startupName : `${startupName} ${investorName}`;
        return String(name).toLowerCase().includes(q);
      });
    }
    if (activeFilters.size > 0) {
      list = list.filter(d => {
        const v = viewAs === "startup" ? d.investor?.type : d.startup?.stage;
        return v && activeFilters.has(v);
      });
    }
    if (statusFilter !== "all") {
      list = list.filter(d => statusFilter === "active"
        ? d.status !== "closed" && d.status !== "passed"
        : d.status === statusFilter);
    }
    const sorted = [...list];
    if (sortKey === "amount_desc") sorted.sort((a, b) => (b.amount || 0) - (a.amount || 0));
    else if (sortKey === "amount_asc") sorted.sort((a, b) => (a.amount || 0) - (b.amount || 0));
    else if (sortKey === "created_desc") sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    else if (sortKey === "follow_up_due") sorted.sort((a, b) => {
      if (!a.next_follow_up && !b.next_follow_up) return 0;
      if (!a.next_follow_up) return 1;
      if (!b.next_follow_up) return -1;
      return new Date(a.next_follow_up).getTime() - new Date(b.next_follow_up).getTime();
    });
    else if (sortKey === "stage_age") sorted.sort((a, b) => {
      // Oldest stage entry first. Deals with no stamp (pre-020 rows the
      // backfill somehow missed) sort last rather than pretending to be ancient.
      const at = a.stage_entered_at ? new Date(a.stage_entered_at).getTime() : Infinity;
      const bt = b.stage_entered_at ? new Date(b.stage_entered_at).getTime() : Infinity;
      return at - bt;
    });
    else sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return sorted;
  }, [deals, search, activeFilters, statusFilter, sortKey, viewAs, t]);

  function toggleFilter(v: string) {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  }

  function handleExportCsv() {
    const header = [t("deals.csvCounterpart"), t("deals.csvAmount"), t("deals.csvCurrency"), t("deals.csvStatus"), t("deals.csvUpdated")];
    const rows = filteredDeals.map(d => {
      const { investorName, startupName } = dealNames(d, t);
      const name = viewAs === "startup" ? investorName : viewAs === "investor" ? startupName : `${startupName} x ${investorName}`;
      return [name, d.amount ?? "", d.currency ?? "", d.status, d.updated_at];
    });
    const csv = [header, ...rows].map(r => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "deals.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const newDealButton = (
    <div style={{ display: "inline-flex", gap: "8px", flexWrap: "wrap" }}>
      <button onClick={() => setShowNewDeal(true)}
        style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "#fff", padding: "9px 16px", cursor: "pointer" }}>
        <Plus style={{ width: 14, height: 14 }} /> {t("deals.newDeal")}
      </button>
      {/* B18: founders only — an off-platform contact belongs to a startup. */}
      {viewAs === "startup" && (
        <button onClick={() => setShowExternal(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "transparent", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)", padding: "9px 16px", cursor: "pointer" }}>
          <Plus style={{ width: 14, height: 14 }} /> {t("external.button")}
        </button>
      )}
    </div>
  );

  const modal = (
    <>
      {showNewDeal && <NewDealModal viewAs={viewAs} ownProfile={ownProfile} onClose={() => setShowNewDeal(false)} onCreated={() => router.refresh()} />}
      {showExternal && <ExternalInvestorModal onClose={() => setShowExternal(false)} onCreated={() => router.refresh()} />}
    </>
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
      {/* Pipeline stats.
          These were five flex items sized by their own content, so they came
          out five different widths and wrapped into a ragged block — the "$1.2M
          + €400k" box is three times the width of "4". An even grid instead:
          same width each, wrapping into tidy rows. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: "10px", marginBottom: "16px" }}>
        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "10px 16px" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("deals.statActivePipeline")}</p>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "15px", color: "var(--cr-copper)" }}>
            {stats.byCurrency.size === 0 ? "—" : Array.from(stats.byCurrency.entries()).map(([cur, amt]) => formatMoney(amt, cur, { compact: true })).join(" + ")}
          </p>
        </div>
        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "10px 16px" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("deals.statActiveDeals")}</p>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)" }}>{stats.activeCount}</p>
        </div>
        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "10px 16px" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("deals.statCloseRate")}</p>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)" }}>
            {stats.closeRate == null ? "—" : `${Math.round(stats.closeRate * 100)}%`}
          </p>
        </div>
        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "10px 16px" }} title={t("deals.statCycleHint")}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("deals.statCycle")}</p>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)" }}>
            {stats.medianCycle == null ? "—" : t("deals.days", { n: stats.medianCycle })}
          </p>
        </div>
        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "10px 16px" }} title={t("deals.statAgeHint")}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("deals.statAge")}</p>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "15px", color: stats.medianAge != null && stats.medianAge > 30 ? "var(--cr-copper)" : "var(--cr-ink)" }}>
            {stats.medianAge == null ? "—" : t("deals.days", { n: stats.medianAge })}
          </p>
        </div>
      </div>

      {/* Toolbar.
          This was one wrapping row holding the search box, every filter chip,
          the clear link, the sort select, export, the view toggle and the new-
          deal button — so on a laptop it broke into two or three ragged lines
          and the primary button moved every time a chip was toggled.

          Two rows now. The things you act WITH stay put on the first row;
          the filters, whose number varies, wrap on their own below and move
          nothing. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={t("deals.filterSearchPlaceholder")}
          style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink)", padding: "8px 10px", outline: "none", flex: "1 1 200px", minWidth: "160px", maxWidth: "320px" }} />
        <div style={{ flex: 1 }} />
        <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
          aria-label={t("deals.sortBy")}
          style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink)", padding: "8px 10px", outline: "none", cursor: "pointer" }}>
          {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{t(o.labelKey)}</option>)}
        </select>
        {canExport && (
          <button onClick={handleExportCsv}
            style={{ background: "transparent", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink-3)", padding: "8px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
            {t("deals.exportCsv")}
          </button>
        )}
        <div style={{ display: "flex", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", overflow: "hidden" }}>
          {(["kanban", "list"] as const).map(v => (
            <button key={v} onClick={() => chooseView(v)} aria-label={v}
              style={{ padding: "7px 10px", background: viewMode === v ? "var(--cr-ink)" : "transparent", color: viewMode === v ? "#fff" : "var(--cr-ink-4)", border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}>
              {v === "kanban" ? <LayoutGrid style={{ width: 15, height: 15 }} /> : <List style={{ width: 15, height: 15 }} />}
            </button>
          ))}
        </div>
        {newDealButton}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginBottom: "16px" }}>
        <div style={{ display: "flex", border: "1px solid var(--cr-rule-dark)", borderRadius: "12px", overflow: "hidden", marginRight: 4 }}>
          {(["all", "active", "closed", "passed"] as const).map(v => (
            <button key={v} onClick={() => setStatusFilter(v)}
              style={{ background: statusFilter === v ? "var(--cr-band-bg)" : "transparent", color: statusFilter === v ? "var(--cr-band-ink)" : "var(--cr-ink-4)", border: "none", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", padding: "6px 11px", cursor: "pointer" }}>
              {t(`deals.status_${v}`)}
            </button>
          ))}
        </div>
        {filterOptions.map(v => (
          <button key={v} onClick={() => toggleFilter(v)}
            style={{
              background: activeFilters.has(v) ? "var(--cr-copper)" : "var(--cr-paper-2)",
              border: `1px solid ${activeFilters.has(v) ? "var(--cr-copper)" : "var(--cr-rule-dark)"}`,
              borderRadius: "12px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px",
              color: activeFilters.has(v) ? "#fff" : "var(--cr-ink-3)", padding: "6px 12px", cursor: "pointer",
            }}>
            {chipLabel(v)}
          </button>
        ))}
        {activeFilters.size > 0 && (
          <button onClick={() => setActiveFilters(new Set())}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)", textDecoration: "underline" }}>
            {t("deals.clearFilters")}
          </button>
        )}
      </div>

      {viewMode === "kanban" ? (
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", gap: "14px", minWidth: "max-content", paddingBottom: "8px" }}>
            {/* Stage zero. A deal's life starts as a REQUEST — it deserves a
                column, not a banner: Proposal → Talking → Negotiation →
                Final proposal → Finalised, left to right. */}
            <DealProposals variant="column" onChanged={onProposalsChanged} />
            {columns.map(col => {
              const colDeals = filteredDeals.filter(d => d.status === col.status);
              // A column shows its first few and says how many more there are.
              // Scrolling a column to find out what is in it is not the same as
              // being told, and a board you have to scroll five times to read
              // is not giving you the pipeline at a glance.
              const showAll = expandedCols.has(col.status);
              const visible = showAll ? colDeals : colDeals.slice(0, COLUMN_PREVIEW);
              const hidden = colDeals.length - visible.length;
              return (
                <div key={col.status} style={{ width: "264px", flexShrink: 0, display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 260px)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center" }}>
                      <span style={colBadgeStyle(col.status, colDeals.length)}>{col.label}</span>
                      {/* The jargon-heavy stages explain themselves where a
                          first-time founder actually meets them. */}
                      {col.status === "due_diligence" && <InfoTip termKey="glossary.dueDiligence" />}
                      {col.status === "term_sheet" && <InfoTip termKey="glossary.termSheet" />}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>
                      {colDeals.length}
                    </span>
                  </div>
                  {/* The column scrolls, not the page. One column with nine
                      deals used to set the height of the whole board and push
                      the empty ones off the bottom of the screen. */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", paddingRight: "2px", minHeight: 0 }}>
                    {colDeals.length === 0 ? <EmptySlot /> : visible.map(deal => (
                      <DealCard key={deal.id} deal={deal} viewAs={viewAs} revealIdentity={revealIdentity} equityOffered={equityOffered}
                        onStatusChange={onStatusChange} onDealClose={onDealClose} onSetFollowUp={onSetFollowUp} onSetCommitment={onSetCommitment} />
                    ))}

                    {(hidden > 0 || showAll) && (
                      <button onClick={() => setExpandedCols(prev => {
                        const next = new Set(prev);
                        if (next.has(col.status)) next.delete(col.status); else next.add(col.status);
                        return next;
                      })}
                        style={{ background: "var(--cr-paper-2)", border: "1px dashed var(--cr-rule-dark)", borderRadius: "4px",
                          cursor: "pointer", padding: "8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                          fontSize: "11px", color: "var(--cr-copper)" }}>
                        {showAll ? t("deals.showFewer") : t("deals.showAllInColumn", { n: hidden })}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
        <DealProposals onChanged={onProposalsChanged} />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Sans', sans-serif", fontSize: "12px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--cr-rule-dark)" }}>
                {[t("deals.csvCounterpart"), t("deals.listStageOrType"), t("deals.csvAmount"), t("deals.csvStatus"), t("deals.sortFollowUp"), t("deals.csvUpdated")].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map(d => {
                const { investorName, startupName } = dealNames(d, t);
                const name = viewAs === "startup" ? investorName : viewAs === "investor" ? startupName : `${startupName} × ${investorName}`;
                const stageOrType = viewAs === "startup" ? d.investor?.type : d.startup?.stage;
                return (
                  <tr key={d.id} id={`deal-${d.id}`} style={{ borderBottom: "1px solid var(--cr-rule)" }}>
                    <td style={{ padding: "8px 10px", color: "var(--cr-ink)" }}>{name}</td>
                    <td style={{ padding: "8px 10px", color: "var(--cr-ink-3)" }}>{stageOrType ? chipLabel(String(stageOrType)) : "—"}</td>
                    <td style={{ padding: "8px 10px", color: "var(--cr-copper)", fontFamily: "'JetBrains Mono', monospace" }}>{d.amount != null ? formatMoney(d.amount, d.currency, { compact: true }) : "—"}</td>
                    <td style={{ padding: "8px 10px" }}><span style={colBadgeStyle(d.status, 0)}>{columns.find(c => c.status === d.status)?.label}</span></td>
                    <td style={{ padding: "8px 10px", color: "var(--cr-ink-3)", fontFamily: "'JetBrains Mono', monospace" }}>{d.next_follow_up ? formatDate(d.next_follow_up) : "—"}</td>
                    <td style={{ padding: "8px 10px", color: "var(--cr-ink-4)", fontFamily: "'JetBrains Mono', monospace" }}>{formatDate(d.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredDeals.length === 0 && <EmptySlot />}
        </div>
        </>
      )}
      {modal}
    </div>
  );
}
