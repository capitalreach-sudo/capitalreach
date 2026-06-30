"use client";

import Link from "next/link";
import { Bookmark, Lock } from "lucide-react";
import { formatCurrency, daysSince, getInitials, STAGE_LABELS } from "@/lib/utils";
import { canAccessFinancials } from "@/types";
import type { Startup, SubscriptionTier } from "@/types";
import { notify } from "@/components/ui/toast-notify";

// ── Score Ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, tier }: { score: number | null; tier?: SubscriptionTier | null }) {
  const size  = 40;
  const sw    = 3.5;
  const r     = size / 2 - sw;
  const c     = size / 2;
  const circ  = 2 * Math.PI * r;

  if (score === null) {
    return (
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--cr-paper-4)"
            strokeWidth={sw} strokeDasharray="4 4" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "10px", color: "var(--cr-ink-4)" }}>?</span>
        </div>
      </div>
    );
  }

  const canSee = !tier || tier === "free" ? false : true;

  if (!canSee) {
    return (
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--cr-paper-4)" strokeWidth={sw} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Lock style={{ width: 11, height: 11, color: "var(--cr-ink-4)" }} />
        </div>
      </div>
    );
  }

  const dash = (score / 100) * circ;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }} title={`AI Score: ${score}/100`}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--cr-paper-4)" strokeWidth={sw} />
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--cr-copper)" strokeWidth={sw}
          strokeLinecap="square" strokeDasharray={`${dash} ${circ}`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "10px", color: "var(--cr-copper)" }}>{score}</span>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface StartupCardProps {
  startup:     Startup;
  investorTier?: SubscriptionTier | null;
  isSaved?:    boolean;
  onSave?:     (startupId: string) => void;
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function StartupCard({ startup, investorTier, isSaved, onSave }: StartupCardProps) {
  const canSeeFinancials = canAccessFinancials(investorTier ?? null);
  const isNew            = daysSince(startup.created_at) <= 5;
  const score            = startup.vaultrise_score ?? null;

  function handleSave(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onSave?.(startup.id);
    notify[isSaved ? "info" : "success"](isSaved ? "Removed from watchlist" : "Saved to watchlist");
  }

  return (
    <Link href={`/startups/${startup.slug}`} style={{ display: "block", textDecoration: "none" }}>
      <div
        style={{
          position:     "relative",
          display:      "flex",
          flexDirection: "column",
          background:   "var(--cr-paper-2)",
          border:       "1px solid var(--cr-rule-dark)",
          borderRadius: "4px",
          padding:      "20px",
          transition:   "background 120ms ease, border-color 120ms ease",
          cursor:       "pointer",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = "var(--cr-paper-3)";
          (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-paper-4)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = "var(--cr-paper-2)";
          (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)";
        }}
      >

        {/* Bookmark */}
        {onSave && (
          <button
            onClick={handleSave}
            style={{
              position:   "absolute",
              top:        "16px",
              right:      "16px",
              background: "none",
              border:     "none",
              cursor:     "pointer",
              padding:    "2px",
              display:    "flex",
              alignItems: "center",
            }}
            aria-label={isSaved ? "Remove from watchlist" : "Save to watchlist"}
          >
            <Bookmark style={{
              width:  16,
              height: 16,
              color:  isSaved ? "var(--cr-copper)" : "var(--cr-ink-4)",
              fill:   isSaved ? "var(--cr-copper)" : "transparent",
            }} />
          </button>
        )}

        {/* Row 1 — Logo + name + score */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "14px", paddingRight: onSave ? "24px" : 0 }}>
          <div style={{
            width:         40,
            height:        40,
            borderRadius:  "4px",
            background:    "var(--cr-paper-3)",
            border:        "1px solid var(--cr-rule)",
            display:       "flex",
            alignItems:    "center",
            justifyContent: "center",
            flexShrink:    0,
            overflow:      "hidden",
            fontFamily:    "'DM Sans', sans-serif",
            fontWeight:    700,
            fontSize:      "15px",
            color:         "var(--cr-copper)",
          }}>
            {getInitials(startup.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {startup.name}
            </p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {startup.tagline}
            </p>
          </div>
          <ScoreRing score={score} tier={investorTier} />
        </div>

        {/* Row 2 — Badges */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
          <span style={{
            background:    "var(--cr-copper-bg)",
            border:        "1px solid var(--cr-copper-br)",
            color:         "var(--cr-copper)",
            fontFamily:    "'DM Sans', sans-serif",
            fontWeight:    500,
            fontSize:      "10px",
            borderRadius:  "3px",
            padding:       "2px 8px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}>
            {startup.industry}
          </span>
          <span style={{
            background:    "var(--cr-paper-4)",
            border:        "1px solid var(--cr-rule)",
            color:         "var(--cr-ink-3)",
            fontFamily:    "'DM Sans', sans-serif",
            fontWeight:    400,
            fontSize:      "10px",
            borderRadius:  "3px",
            padding:       "2px 8px",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}>
            {STAGE_LABELS[startup.stage] ?? startup.stage}
          </span>
          {isNew && (
            <span style={{
              background:    "var(--cr-up-bg)",
              border:        "1px solid rgba(45,106,79,0.25)",
              color:         "var(--cr-up)",
              fontFamily:    "'DM Sans', sans-serif",
              fontWeight:    500,
              fontSize:      "10px",
              borderRadius:  "3px",
              padding:       "2px 8px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              New
            </span>
          )}
        </div>

        {/* Row 3 — Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
          {[
            { label: "MRR",    value: startup.mrr         ? formatCurrency(startup.mrr, true)                                              : null, gated: true  },
            { label: "ARR",    value: startup.arr         ? formatCurrency(startup.arr, true)                                              : null, gated: true  },
            { label: "Growth", value: startup.growth_rate != null ? `${startup.growth_rate >= 0 ? "+" : ""}${startup.growth_rate}%`        : null, gated: false },
          ].map(({ label, value, gated }) => (
            <div key={label} style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "3px", padding: "10px 10px 8px" }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>
                {label}
              </div>
              {gated && !canSeeFinancials ? (
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <div className="skeleton" style={{ height: 13, width: 36, borderRadius: "2px" }} />
                  <Lock style={{ width: 10, height: 10, color: "var(--cr-ink-4)" }} />
                </div>
              ) : value ? (
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600,
                  fontSize:   "13px",
                  color:      startup.growth_rate != null && label === "Growth"
                    ? startup.growth_rate >= 0 ? "var(--cr-up)" : "var(--cr-down)"
                    : "var(--cr-ink)",
                }}>
                  {value}
                </div>
              ) : (
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>—</div>
              )}
            </div>
          ))}
        </div>

        {/* Row 4 — Raise strip */}
        <div style={{
          display:       "flex",
          alignItems:    "center",
          justifyContent: "space-between",
          paddingTop:    "12px",
          borderTop:     "1px solid var(--cr-rule)",
        }}>
          <div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>
              Raising
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "15px", color: "var(--cr-copper)" }}>
              {formatCurrency(startup.funding_target, true)}
            </div>
          </div>
          {startup.runway_months != null && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>
              {startup.runway_months}mo runway
            </div>
          )}
        </div>

        {/* Upgrade hint */}
        {!canSeeFinancials && investorTier !== undefined && (
          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--cr-rule)" }}>
            <Link
              href="/pricing"
              onClick={(e) => e.stopPropagation()}
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                gap:            "5px",
                fontFamily:     "'DM Sans', sans-serif",
                fontWeight:     400,
                fontSize:       "11px",
                color:          "var(--cr-copper)",
                textDecoration: "none",
              }}
            >
              <Lock style={{ width: 10, height: 10 }} />
              Upgrade to unlock financials &amp; AI scores
            </Link>
          </div>
        )}
      </div>
    </Link>
  );
}
