"use client";

import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DollarSign, X, CheckCircle2, TrendingUp, Lock } from "lucide-react";
import type { Deal, DealStatus } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

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
  onDealClose?: (dealId: string, amount: number) => void;
  viewAs: "startup" | "investor";
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

// ── Deal card ─────────────────────────────────────────────────────────────────

function DealCard({ deal, viewAs, onStatusChange, onDealClose, revealIdentity = true }: {
  deal: Deal;
  viewAs: "startup" | "investor";
  onStatusChange?: (id: string, status: DealStatus) => void;
  onDealClose?: (id: string, amount: number) => void;
  revealIdentity?: boolean;
}) {
  const { t } = useTranslation();
  const columns = useColumns();
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closeAmount, setCloseAmount]     = useState(deal.amount ? String(deal.amount) : "");
  const [closing, setClosing]             = useState(false);

  const realName = viewAs === "startup"
    ? ((deal as any).investor?.display_name || (deal as any).investor?.firm_name || (deal as any).investor?.slug || t("deals.investorFallback"))
    : ((deal as any).startup?.name || t("deals.startupFallback"));

  const masked = viewAs === "startup" && !revealIdentity;
  const name   = masked ? t("deals.interestedInvestor") : realName;

  const isActive = deal.status !== "closed" && deal.status !== "passed";

  async function handleClose() {
    if (!onDealClose) return;
    setClosing(true);
    await onDealClose(deal.id, parseFloat(closeAmount) || 0);
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
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)", marginTop: "4px" }}>
          {formatCurrency(deal.amount, true)}
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
          <div style={{ position: "relative", marginBottom: "8px" }}>
            <DollarSign style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "var(--cr-ink-4)" }} />
            <input type="number" placeholder={t("deals.amountRaisedPlaceholder")}
              value={closeAmount} onChange={e => setCloseAmount(e.target.value)}
              style={{ width: "100%", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink)", paddingLeft: "28px", paddingRight: "10px", paddingTop: "6px", paddingBottom: "6px", outline: "none", boxSizing: "border-box" }} />
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
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function DealKanban({ deals, onStatusChange, onDealClose, viewAs, revealIdentity = true }: DealKanbanProps) {
  const { t } = useTranslation();
  const columns = useColumns();

  if (deals.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 24px", textAlign: "center" }}>
        <TrendingUp style={{ width: 36, height: 36, color: "var(--cr-ink-4)", marginBottom: "16px" }} />
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "18px", color: "var(--cr-ink)", marginBottom: "8px" }}>{t("deals.emptyTitle")}</p>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)" }}>
          {t("deals.emptyDesc")}
        </p>
      </div>
    );
  }

  return (
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
  );
}
