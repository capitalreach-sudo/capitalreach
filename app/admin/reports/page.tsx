"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Navbar } from "@/components/shared/navbar";
import { notify } from "@/components/ui/toast-notify";
import { formatDate } from "@/lib/utils";

/**
 * Triage for the incident bench.
 *
 * A report is somebody's claim, not a finding, and this page is built so that
 * nothing happens to it except by somebody pressing a button. There is no
 * default action, no ordering by severity, and no count that trips anything:
 * if six reports could take a listing down on their own, an investor could
 * clear a rival off the marketplace for the price of six form submissions.
 *
 * The count IS shown, because the reviewer needs to see a pile-on as a
 * pile-on. Six reports from six anonymous visitors inside an hour is a
 * different file from six reports from six named members over six months, and
 * the row says which it is looking at.
 *
 * Suspension here takes the listing off the market. It does not lock the
 * account: that is /api/admin/suspend, a heavier decision taken by a person
 * who has read the whole file. The note travels to the member, who is entitled
 * to know what they are being asked to answer. The counterparty on an open
 * deal is told only that the listing is under review, and the page says so
 * above the button, because the reason and the reporter must not travel to a
 * third party who cannot weigh either.
 *
 * Strings are not routed through useTranslation. The admin surface is English
 * only, and the routes behind it return their errors in English.
 */

const UI = "'DM Sans', sans-serif";
const MONO = "'JetBrains Mono', monospace";

const label: React.CSSProperties = {
  fontFamily: UI, fontWeight: 500, fontSize: "10px", letterSpacing: "0.07em",
  textTransform: "uppercase", color: "var(--cr-ink-4)",
};

const body: React.CSSProperties = {
  fontFamily: UI, fontWeight: 300, fontSize: "13px", lineHeight: 1.6,
  color: "var(--cr-ink-3)",
};

const dateFigure: React.CSSProperties = {
  fontFamily: MONO, fontWeight: 500, fontSize: "11px",
  fontVariantNumeric: "tabular-nums", color: "var(--cr-ink-4)",
};

const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", fontFamily: UI, fontWeight: 400,
  fontSize: "13px", color: "var(--cr-ink)", background: "var(--cr-paper-2)",
  border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "8px 10px",
  resize: "vertical",
};

const actionBtn: React.CSSProperties = {
  fontFamily: UI, fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)",
  background: "none", border: "1px solid var(--cr-rule-dark)",
  borderRadius: "999px", padding: "8px 16px", cursor: "pointer", minHeight: "40px",
};

const primaryBtn: React.CSSProperties = {
  ...actionBtn, color: "var(--cr-paper)",
  background: "var(--cr-copper)", border: "1px solid var(--cr-copper)",
};

const linkStyle: React.CSSProperties = {
  fontFamily: UI, fontWeight: 500, fontSize: "12px",
  color: "var(--cr-copper)", textDecoration: "none",
  display: "inline-flex", alignItems: "center", gap: "5px",
};

const FILTERS = [
  { key: "open", name: "Open" },
  { key: "investigating", name: "Investigating" },
  { key: "actioned", name: "Actioned" },
  { key: "dismissed", name: "Dismissed" },
  { key: "all", name: "All" },
] as const;

interface ReportRow {
  id: string;
  subjectType: "startup" | "investor";
  subjectId: string;
  reason: string;
  detail: string | null;
  status: string;
  handledAt: string | null;
  createdAt: string;
  subjectName: string | null;
  subjectHref: string | null;
  subjectLive: boolean;
  subjectState: string | null;
  reporterLabel: string | null;
  reportsOnSubject: number;
  anonymousOnSubject: number;
  openOnSubject: number;
}

type Action = "suspend" | "request_evidence" | "dismiss";

const ACTION_NAMES: Record<Action, string> = {
  suspend: "Take the listing down",
  request_evidence: "Ask them for evidence",
  dismiss: "Dismiss",
};

export default function AdminReportsPage() {
  const [filter, setFilter] = useState<string>("open");
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [canAct, setCanAct] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Action | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (status: string) => {
    try {
      const res = await fetch(`/api/reports?status=${encodeURIComponent(status)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFailed(data.error || "Could not load the queue."); setReports([]); return; }
      setFailed(null);
      setReports(data.reports ?? []);
      setCanAct(data.canAct === true);
    } catch {
      setFailed("Could not reach the queue.");
      setReports([]);
    }
  }, []);

  useEffect(() => { void load(filter); }, [load, filter]);

  function open(r: ReportRow) {
    const next = openId === r.id ? null : r.id;
    setOpenId(next);
    // A note written about one report never follows the reviewer to the next.
    setChosen("");
    setNote("");
  }

  async function act(r: ReportRow) {
    if (!chosen) { notify.error("Choose what you are doing."); return; }
    if ((chosen === "suspend" || chosen === "request_evidence") && !note.trim()) {
      notify.error(chosen === "suspend" ? "Say why the listing is coming down." : "Say what you are asking them for.");
      return;
    }

    setBusy(r.id);
    let res: Response | null = null;
    let data: { error?: string; counterpartiesTold?: number } = {};
    try {
      res = await fetch(`/api/admin/reports/${r.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: chosen, note: note.trim() || undefined }),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      data = {};
    } finally {
      setBusy(null);
    }

    if (!res?.ok) { notify.error(data.error || "Could not record that."); return; }

    notify.success(
      chosen === "suspend"
        ? data.counterpartiesTold
          ? `Listing down. ${data.counterpartiesTold} counterparty told it is under review.`
          : "Listing down."
        : chosen === "dismiss"
          ? "Dismissed."
          : "Asked.",
    );
    setOpenId(null);
    setChosen("");
    setNote("");
    await load(filter);
  }

  const list = reports ?? [];

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "80vh" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "100px 24px 64px" }}>
          <div className="ruled-label" style={{ marginBottom: "16px" }}>Reports</div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700,
            fontSize: "clamp(28px,4vw,44px)", color: "var(--cr-ink)",
            letterSpacing: "-0.02em", marginBottom: "8px",
          }}>
            What people have told us
          </h1>
          <p style={{ ...body, maxWidth: "66ch", marginBottom: "24px" }}>
            Anyone can file one of these, including a visitor with no account, and nothing on this
            page happens until you make it happen. A run of reports against one listing is as likely
            to be a rival as a whistleblower, so the number of reports on a subject is shown beside
            every row and counts towards nothing on its own.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => { setFilter(f.key); setOpenId(null); }}
                style={{
                  ...actionBtn,
                  minHeight: "32px", padding: "5px 14px", fontSize: "12px",
                  color: filter === f.key ? "var(--cr-paper)" : "var(--cr-ink-3)",
                  background: filter === f.key ? "var(--cr-ink)" : "none",
                  border: `1px solid ${filter === f.key ? "var(--cr-ink)" : "var(--cr-rule-dark)"}`,
                }}
              >
                {f.name}
              </button>
            ))}
          </div>

          {failed && <p style={{ ...body, color: "var(--cr-down)", marginBottom: "16px" }}>{failed}</p>}
          {reports === null && <p style={label}>Loading</p>}
          {reports !== null && list.length === 0 && !failed && (
            <p style={body}>Nothing to review.</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {list.map((r) => {
              const isOpen = openId === r.id;
              return (
                <div
                  key={r.id}
                  style={{
                    border: "1px solid var(--cr-rule-dark)", borderRadius: "4px",
                    background: "var(--cr-paper)", padding: "16px 18px",
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", alignItems: "baseline" }}>
                    <span style={{ fontFamily: UI, fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)" }}>
                      {r.subjectName || `Unnamed ${r.subjectType}`}
                    </span>
                    <span style={label}>{r.subjectType}</span>
                    <span style={{ ...label, color: r.subjectLive ? "var(--cr-ink-4)" : "var(--cr-copper)" }}>
                      {r.subjectLive ? "live" : `not live (${r.subjectState ?? "unknown"})`}
                    </span>
                    {r.subjectHref && (
                      <a href={r.subjectHref} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                        Open
                        <ExternalLink style={{ width: 11, height: 11 }} aria-hidden />
                      </a>
                    )}
                    <span style={dateFigure}>{formatDate(r.createdAt)}</span>
                  </div>

                  <div style={{ marginTop: "12px", borderTop: "1px solid var(--cr-rule)" }}>
                    <Fact name="Reason">
                      <span style={{ ...body, fontSize: "13px", color: "var(--cr-ink)" }}>
                        {r.reason.replace(/_/g, " ")}
                      </span>
                    </Fact>
                    {r.detail && (
                      <Fact name="What they said">
                        <span style={{ ...body, fontSize: "13px", color: "var(--cr-ink)", whiteSpace: "pre-wrap" }}>
                          {r.detail}
                        </span>
                      </Fact>
                    )}
                    <Fact name="Filed by">
                      <span style={{ ...body, fontSize: "13px", color: "var(--cr-ink)" }}>
                        {r.reporterLabel ?? "No account attached"}
                      </span>
                    </Fact>
                    {/* The brigading signal, stated rather than scored. */}
                    <Fact name="On this subject">
                      <span style={{ ...body, fontSize: "13px", color: r.reportsOnSubject > 1 ? "var(--cr-ink)" : "var(--cr-ink-3)" }}>
                        {r.reportsOnSubject} report{r.reportsOnSubject === 1 ? "" : "s"} in total,{" "}
                        {r.anonymousOnSubject} with no account attached, {r.openOnSubject} still open.
                      </span>
                    </Fact>
                    <Fact name="Status">
                      <span style={{ ...body, fontSize: "13px", color: "var(--cr-ink)" }}>
                        {r.status}
                        {r.handledAt ? ` since ${formatDate(r.handledAt)}` : ""}
                      </span>
                    </Fact>
                  </div>

                  {(r.status === "open" || r.status === "investigating") && (
                    <div style={{ marginTop: "14px" }}>
                      <button onClick={() => open(r)} style={{
                        fontFamily: UI, fontWeight: 500, fontSize: "13px", color: "var(--cr-copper)",
                        background: "none", border: "none", padding: "8px 0", cursor: "pointer",
                        textDecoration: "underline", textUnderlineOffset: "3px",
                      }}>
                        {isOpen ? "Close" : "Decide"}
                      </button>
                    </div>
                  )}

                  {isOpen && (
                    <div style={{
                      marginTop: "8px", borderTop: "1px solid var(--cr-rule-dark)", paddingTop: "16px",
                      display: "flex", flexDirection: "column", gap: "14px",
                    }}>
                      {!canAct && (
                        <p style={{ ...body, fontSize: "12px", margin: 0 }}>
                          Acting on a report needs an operator-level admin.
                        </p>
                      )}

                      <div style={{ display: "grid", gap: "6px" }}>
                        {(Object.keys(ACTION_NAMES) as Action[]).map((a) => (
                          <label key={a} style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: UI, fontSize: "13px", color: "var(--cr-ink)", cursor: "pointer" }}>
                            <input
                              type="radio"
                              name={`action-${r.id}`}
                              disabled={!canAct}
                              checked={chosen === a}
                              onChange={() => setChosen(a)}
                            />
                            {ACTION_NAMES[a]}
                          </label>
                        ))}
                      </div>

                      {chosen === "suspend" && (
                        <p style={{ ...body, fontSize: "12px", margin: 0, maxWidth: "66ch" }}>
                          This takes the listing off the market. It does not lock the account, which
                          is a separate decision on the user page. Your note goes to the member so
                          they know what to answer. Anyone mid-deal with them is told the listing is
                          under review and nothing else: not the reason, not who reported it.
                        </p>
                      )}
                      {chosen === "request_evidence" && (
                        <p style={{ ...body, fontSize: "12px", margin: 0, maxWidth: "66ch" }}>
                          The listing stays up. Your note goes to the member as the thing you are
                          asking them for. Do not name the reporter in it.
                        </p>
                      )}
                      {chosen === "dismiss" && (
                        <p style={{ ...body, fontSize: "12px", margin: 0, maxWidth: "66ch" }}>
                          Closes the report and changes nothing about the listing. The reporter is
                          told it was looked at, and is not told what was decided.
                        </p>
                      )}

                      {chosen && (
                        <div>
                          <label htmlFor={`note-${r.id}`} style={{ ...label, display: "block", marginBottom: "6px" }}>
                            Note {chosen === "dismiss" ? "(optional, kept for the log)" : "(required, sent to the member)"}
                          </label>
                          <textarea
                            id={`note-${r.id}`}
                            value={note}
                            onChange={(e) => setNote(e.target.value.slice(0, 1000))}
                            rows={3}
                            style={input}
                          />
                        </div>
                      )}

                      <div>
                        <button
                          onClick={() => void act(r)}
                          disabled={!canAct || !chosen || busy === r.id}
                          style={{
                            ...(chosen === "suspend" ? primaryBtn : actionBtn),
                            opacity: !canAct || !chosen || busy === r.id ? 0.45 : 1,
                          }}
                        >
                          {busy === r.id ? "Recording" : chosen ? ACTION_NAMES[chosen] : "Choose an action"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}

/** One labelled fact on a hairline rule. Inside a card, structure is rules. */
function Fact({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)]"
      style={{ gap: "2px 16px", padding: "8px 0", borderBottom: "1px solid var(--cr-rule)", alignItems: "baseline" }}
    >
      <span style={label}>{name}</span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}
