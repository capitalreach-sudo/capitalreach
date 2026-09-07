"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";
import { formatDate } from "@/lib/utils";
import type { ReviewLane } from "@/lib/trust";

/**
 * The reviewer's bench.
 *
 * A verification decision is a ledger entry, not a moderation swipe: the row
 * states who is asking for what, what the automated pass found, and what the
 * evidence is -- and only then offers the three things a reviewer can do.
 *
 * The risk score is a figure, deliberately. A coloured gauge invites a
 * reviewer to read "amber, probably fine" off a bar; a number next to the
 * flags that produced it makes them read the flags. Colour appears once, on
 * the lane chip, because the lane decides who is allowed to act at all.
 */

type CaseStatus = "submitted" | "in_review" | "needs_more";

interface QueueEvidence {
  id: string;
  kind: string;
  method: string;
  status: string;
  detail: Record<string, unknown>;
  checkedAt: string | null;
  fileUrl: string | null;
}

interface QueueCase {
  id: string;
  subjectType: "startup" | "investor";
  subjectId: string;
  subjectName: string;
  subjectSlug: string | null;
  ownerEmail: string;
  status: CaseStatus;
  levelRequested: number;
  levelGranted: number | null;
  riskScore: number;
  riskFlags: Array<{ signal: string; severity: "info" | "low" | "medium" | "high" }>;
  lane: ReviewLane;
  decisionNote: string | null;
  createdAt: string;
  evidence: QueueEvidence[];
}

const UI = "'DM Sans', sans-serif";
const MONO = "'JetBrains Mono', monospace";

const label: React.CSSProperties = {
  fontFamily: UI, fontWeight: 500, fontSize: "10px", letterSpacing: "0.07em",
  textTransform: "uppercase", color: "var(--cr-ink-4)",
};

const figure: React.CSSProperties = {
  fontFamily: MONO, fontWeight: 600, fontSize: "13px",
  fontVariantNumeric: "tabular-nums", color: "var(--cr-ink)",
};

const chipBase: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "5px", borderRadius: "3px",
  padding: "2px 7px", fontFamily: UI, fontWeight: 500, fontSize: "10px",
  letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap",
};

function laneChip(lane: ReviewLane): React.CSSProperties {
  if (lane === "blocked") {
    return { ...chipBase, color: "var(--cr-down)", background: "var(--cr-down-bg)", border: "1px solid color-mix(in srgb, var(--cr-down) 30%, transparent)" };
  }
  if (lane === "enhanced") {
    return { ...chipBase, color: "var(--cr-copper)", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)" };
  }
  return { ...chipBase, color: "var(--cr-ink-3)", background: "transparent", border: "1px solid var(--cr-rule-dark)" };
}

/** Evidence status carries the one colour the house reserves for a settled,
 *  matured state; everything unfinished stays quiet. */
function evidenceColor(status: string): string {
  if (status === "passed") return "var(--verdigris)";
  if (status === "failed" || status === "expired") return "var(--cr-copper)";
  return "var(--cr-ink-4)";
}

const primaryBtn: React.CSSProperties = {
  fontFamily: UI, fontWeight: 600, fontSize: "13px", color: "var(--cr-paper)",
  background: "var(--cr-copper)", border: "1px solid var(--cr-copper)",
  borderRadius: "999px", padding: "8px 18px", cursor: "pointer", minHeight: "40px",
};

const quietBtn: React.CSSProperties = {
  fontFamily: UI, fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)",
  background: "transparent", border: "1px solid var(--cr-paper-4)",
  borderRadius: "999px", padding: "8px 16px", cursor: "pointer", minHeight: "40px",
};

const textBtn: React.CSSProperties = {
  fontFamily: UI, fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-3)",
  background: "none", border: "none", padding: "8px 4px", cursor: "pointer",
  textDecoration: "underline", textUnderlineOffset: "3px", minHeight: "40px",
};

const LANES: Array<ReviewLane | "all"> = ["all", "standard", "enhanced", "blocked"];

/** jsonb from a vendor or an internal check: shown compactly, never trusted
 *  to be shaped. Objects and arrays collapse to JSON rather than "[object]". */
function detailSummary(detail: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(detail)) {
    if (v === null || v === undefined) continue;
    const value = typeof v === "object" ? JSON.stringify(v) : String(v);
    parts.push(`${k.replace(/_/g, " ")} ${value}`);
    if (parts.join(" · ").length > 140) break;
  }
  const joined = parts.join(" · ");
  return joined.length > 140 ? `${joined.slice(0, 139)}…` : joined;
}

export default function VerificationQueue({ myLevel }: { myLevel?: string }) {
  const { t } = useTranslation();
  const [cases, setCases] = useState<QueueCase[] | null>(null);
  const [failed, setFailed] = useState(false);
  // The server is the authority on this; the prop only avoids one render in
  // which an owner's own bench looks like an operator's.
  const [canDecideBlocked, setCanDecideBlocked] = useState(myLevel === "owner");
  const [openId, setOpenId] = useState<string | null>(null);
  const [laneFilter, setLaneFilter] = useState<ReviewLane | "all">("all");
  const [note, setNote] = useState("");
  const [grant, setGrant] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Evidence links are signed for two minutes, so the queue is re-fetched
  // rather than cached: a stale link is worse than a second request.
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/verification/list", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFailed(true); setCases([]); return; }
      setCases(data.cases ?? []);
      setCanDecideBlocked(!!data.canDecideBlocked);
      setFailed(false);
    } catch {
      setFailed(true);
      setCases([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function expand(c: QueueCase) {
    const next = openId === c.id ? null : c.id;
    setOpenId(next);
    // One case open at a time keeps one primary action on screen, and the
    // note never follows the reviewer to the next applicant.
    setNote("");
    setGrant(next ? c.levelRequested : null);
  }

  async function decide(c: QueueCase, decision: "approve" | "reject" | "more") {
    if (decision !== "approve" && !note.trim()) {
      notify.error(t("reviewQueue.noteRequired"));
      return;
    }
    setBusy(c.id);
    let res: Response | null = null;
    let data: { error?: string } = {};
    try {
      res = await fetch("/api/admin/verification/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: c.id,
          decision,
          note: note.trim() || undefined,
          level: decision === "approve" ? (grant ?? c.levelRequested) : undefined,
        }),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      data = {};
    } finally {
      setBusy(null);
    }
    if (!res?.ok) { notify.error(data.error || t("errors.generic")); return; }
    notify.success(
      decision === "approve" ? t("reviewQueue.doneApproved", { name: c.subjectName })
      : decision === "reject" ? t("reviewQueue.doneRejected")
      : t("reviewQueue.doneSentBack"),
    );
    setOpenId(null);
    setNote("");
    await load();
  }

  /** Machine vocabularies (evidence kinds, methods, statuses) have keys; a
   *  value added to the enum before its key exists still renders as words. */
  const term = (prefix: string, value: string) => {
    const out = t(`reviewQueue.${prefix}.${value}`);
    return out === `reviewQueue.${prefix}.${value}` ? value.replace(/_/g, " ") : out;
  };

  const list = (cases ?? []).filter((c) => laneFilter === "all" || c.lane === laneFilter);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <h2 className="ruled-label">{t("reviewQueue.title")}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {LANES.map((l) => (
            <button
              key={l}
              onClick={() => setLaneFilter(l)}
              style={{
                ...label,
                background: "none", border: "none", padding: "4px 0", cursor: "pointer",
                color: laneFilter === l ? "var(--cr-copper)" : "var(--cr-ink-4)",
                borderBottom: laneFilter === l ? "1px solid var(--cr-copper)" : "1px solid transparent",
              }}
            >
              {l === "all" ? t("reviewQueue.laneAll") : t(`reviewQueue.lane.${l}`)}
            </button>
          ))}
          <span style={{ ...figure, fontSize: "12px", color: "var(--cr-ink-4)" }}>{list.length}</span>
        </div>
      </div>

      <p style={{ fontFamily: UI, fontWeight: 300, fontSize: "13px", lineHeight: 1.65, color: "var(--cr-ink-3)", maxWidth: "62ch", margin: 0 }}>
        {t("reviewQueue.subtitle")}
      </p>

      <div style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", background: "var(--cr-paper)", overflow: "hidden" }}>
        {/* Column header, ledger-style: labels on the quiet ground, rows below
            separated by rules. On mobile the columns collapse into the row
            itself, so the header has nothing left to head. */}
        <div
          className="hidden md:grid md:grid-cols-[minmax(0,2.4fr)_60px_60px_110px_100px_24px]"
          style={{
            gap: "12px", padding: "10px 16px", background: "var(--cr-paper-2)",
            borderBottom: "1px solid var(--cr-rule-dark)",
          }}
        >
          <span style={label}>{t("reviewQueue.colSubject")}</span>
          <span style={label}>{t("reviewQueue.colLevel")}</span>
          <span style={label}>{t("reviewQueue.colRisk")}</span>
          <span style={label}>{t("reviewQueue.colLane")}</span>
          <span style={label}>{t("reviewQueue.colSubmitted")}</span>
          <span />
        </div>

        {cases === null && (
          <p style={{ ...label, padding: "18px 16px", margin: 0 }}>{t("common.loading")}</p>
        )}

        {cases !== null && list.length === 0 && (
          <div style={{ padding: "40px 16px", textAlign: "center" }}>
            <span aria-hidden style={{ color: "var(--cr-copper)", fontSize: "14px" }}>✦</span>
            <p style={{ fontFamily: UI, fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", margin: "8px 0 12px" }}>
              {failed ? t("reviewQueue.loadFailed") : t("reviewQueue.empty")}
            </p>
            <button onClick={() => void load()} style={{ ...textBtn, color: "var(--cr-copper)" }}>
              {t("reviewQueue.refresh")}
            </button>
          </div>
        )}

        {list.map((c) => {
          const open = openId === c.id;
          const blocked = c.lane === "blocked" && !canDecideBlocked;
          return (
            <div key={c.id} style={{ borderBottom: "1px solid var(--cr-rule)" }}>
              <button
                onClick={() => expand(c)}
                aria-expanded={open}
                className="w-full grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.4fr)_60px_60px_110px_100px_24px] md:items-center"
                style={{
                  gap: "12px", padding: "14px 16px", textAlign: "start",
                  background: open ? "var(--cr-paper-3)" : "transparent",
                  border: "none", cursor: "pointer",
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: UI, fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.subjectName || t("reviewQueue.unnamed")}
                  </span>
                  <span style={{ display: "block", fontFamily: UI, fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t(`reviewQueue.subject.${c.subjectType}`)} · {c.ownerEmail}
                  </span>
                  {/* 375px keeps the three things a reviewer triages on --
                      level asked for, risk, lane -- on one line under the
                      name; the date and the column grid go. */}
                  <span className="md:hidden" style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
                    <span style={{ ...figure, fontSize: "12px" }}>L{c.levelRequested}</span>
                    <span style={{ ...figure, fontSize: "12px", color: "var(--cr-ink-3)" }}>{c.riskScore}</span>
                    <span style={laneChip(c.lane)}>{t(`reviewQueue.lane.${c.lane}`)}</span>
                  </span>
                </span>
                <span className="hidden md:block" style={figure}>L{c.levelRequested}</span>
                <span className="hidden md:block" style={figure}>{c.riskScore}</span>
                <span className="hidden md:block">
                  <span style={laneChip(c.lane)}>{t(`reviewQueue.lane.${c.lane}`)}</span>
                </span>
                <span className="hidden md:block" style={{ ...figure, fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)" }}>
                  {formatDate(c.createdAt)}
                </span>
                <span style={{ color: "var(--cr-ink-4)", display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                  {open ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
                </span>
              </button>

              {open && (
                <div style={{ padding: "14px 16px 20px", borderTop: "1px solid var(--cr-rule)", display: "flex", flexDirection: "column", gap: "18px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "14px", flexWrap: "wrap" }}>
                    {c.subjectSlug && (
                      <a
                        href={c.subjectType === "startup" ? `/startups/${c.subjectSlug}` : `/investors/${c.subjectSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontFamily: UI, fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}
                      >
                        {t("reviewQueue.viewSubject")} →
                      </a>
                    )}
                    <span className="md:hidden" style={{ ...figure, fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)" }}>
                      {formatDate(c.createdAt)}
                    </span>
                  </div>

                  {/* ── What the automated pass found ─────────────────── */}
                  <div>
                    <p style={{ ...label, margin: "0 0 6px" }}>
                      {t("reviewQueue.flagsTitle")} · <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{c.riskScore}</span>
                    </p>
                    {c.riskFlags.length === 0 ? (
                      <p style={{ fontFamily: UI, fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", margin: 0 }}>{t("reviewQueue.noFlags")}</p>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
                        {c.riskFlags.map((f, i) => (
                          <span key={`${f.signal}-${i}`} style={{ fontFamily: MONO, fontSize: "11px", color: f.severity === "high" || f.severity === "medium" ? "var(--cr-copper)" : "var(--cr-ink-3)" }}>
                            {/* Signals are a machine vocabulary that grows
                                without a deploy, so the raw name is the
                                label; only the severity is translated. */}
                            {f.signal.replace(/_/g, " ")}
                            <span style={{ color: "var(--cr-ink-4)" }}> {t(`reviewQueue.sev.${f.severity}`)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── The evidence itself ───────────────────────────── */}
                  <div>
                    <p style={{ ...label, margin: "0 0 6px" }}>{t("reviewQueue.evidenceTitle")}</p>
                    {c.evidence.length === 0 ? (
                      <p style={{ fontFamily: UI, fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", margin: 0 }}>{t("reviewQueue.noEvidence")}</p>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "520px" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--cr-rule)" }}>
                              {["reviewQueue.colKind", "reviewQueue.colMethod", "reviewQueue.colStatus", "reviewQueue.colDetail", "reviewQueue.colFile"].map((k) => (
                                <th key={k} style={{ ...label, textAlign: "start", padding: "6px 10px 6px 0" }}>{t(k)}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {c.evidence.map((e) => (
                              <tr key={e.id} style={{ borderBottom: "1px solid var(--cr-rule)" }}>
                                <td style={{ padding: "8px 10px 8px 0", fontFamily: UI, fontWeight: 500, fontSize: "12px", color: "var(--cr-ink)", textTransform: "capitalize" }}>
                                  {term("kind", e.kind)}
                                </td>
                                <td style={{ padding: "8px 10px 8px 0", fontFamily: UI, fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", textTransform: "capitalize" }}>
                                  {term("method", e.method)}
                                </td>
                                <td style={{ padding: "8px 10px 8px 0", fontFamily: UI, fontWeight: 500, fontSize: "11px", letterSpacing: "0.05em", textTransform: "uppercase", color: evidenceColor(e.status) }}>
                                  {term("evStatus", e.status)}
                                </td>
                                <td style={{ padding: "8px 10px 8px 0", fontFamily: MONO, fontSize: "11px", color: "var(--cr-ink-4)" }}>
                                  {detailSummary(e.detail) || "—"}
                                </td>
                                <td style={{ padding: "8px 0", fontFamily: UI, fontSize: "12px" }}>
                                  {e.fileUrl ? (
                                    <a href={e.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--cr-copper)", fontWeight: 500, textDecoration: "none" }}>
                                      {t("reviewQueue.openFile")} →
                                    </a>
                                  ) : (
                                    <span style={{ color: "var(--cr-ink-4)" }}>—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <p style={{ fontFamily: UI, fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", margin: "8px 0 0" }}>
                      {t("reviewQueue.linksExpire")}
                    </p>
                  </div>

                  {c.decisionNote && (
                    <div>
                      <p style={{ ...label, margin: "0 0 4px" }}>{t("reviewQueue.lastNote")}</p>
                      <p style={{ fontFamily: UI, fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", margin: 0 }}>{c.decisionNote}</p>
                    </div>
                  )}

                  {/* ── The decision ──────────────────────────────────── */}
                  <div style={{ borderTop: "1px solid var(--cr-rule-dark)", paddingTop: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label htmlFor={`note-${c.id}`} style={{ ...label, display: "block", marginBottom: "6px" }}>
                        {t("reviewQueue.noteLabel")}
                      </label>
                      <textarea
                        id={`note-${c.id}`}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder={t("reviewQueue.notePlaceholder")}
                        style={{
                          width: "100%", fontFamily: UI, fontWeight: 300, fontSize: "13px",
                          color: "var(--cr-ink)", background: "var(--cr-paper-2)",
                          border: "1px solid var(--cr-rule-dark)", borderRadius: "4px",
                          padding: "10px 12px", resize: "vertical",
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                        <span style={label}>{t("reviewQueue.grantLabel")}</span>
                        <select
                          value={grant ?? c.levelRequested}
                          onChange={(e) => setGrant(Number(e.target.value))}
                          aria-label={t("reviewQueue.grantLabel")}
                          style={{
                            fontFamily: MONO, fontSize: "12px", fontVariantNumeric: "tabular-nums",
                            color: "var(--cr-ink)", background: "var(--cr-paper-2)",
                            border: "1px solid var(--cr-rule-dark)", borderRadius: "3px", padding: "6px 8px",
                          }}
                        >
                          {Array.from({ length: c.levelRequested }, (_, i) => i + 1).map((l) => (
                            <option key={l} value={l}>L{l}</option>
                          ))}
                        </select>
                      </span>

                      <button
                        onClick={() => void decide(c, "approve")}
                        disabled={busy === c.id || blocked}
                        style={{ ...primaryBtn, opacity: busy === c.id || blocked ? 0.45 : 1, cursor: blocked ? "not-allowed" : "pointer" }}
                      >
                        {busy === c.id ? t("common.saving") : t("reviewQueue.approve")}
                      </button>
                      <button
                        onClick={() => void decide(c, "more")}
                        disabled={busy === c.id}
                        style={{ ...quietBtn, opacity: busy === c.id ? 0.45 : 1 }}
                      >
                        {t("reviewQueue.askMore")}
                      </button>
                      <button
                        onClick={() => void decide(c, "reject")}
                        disabled={busy === c.id}
                        style={{ ...textBtn, opacity: busy === c.id ? 0.45 : 1 }}
                      >
                        {t("reviewQueue.reject")}
                      </button>
                    </div>

                    {blocked && (
                      <p style={{ fontFamily: UI, fontWeight: 400, fontSize: "12px", color: "var(--cr-down)", margin: 0 }}>
                        {t("reviewQueue.ownerOnly")}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
