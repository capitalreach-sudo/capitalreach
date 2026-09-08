"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";

/**
 * The case file, as a dossier rather than a charge sheet.
 *
 * A reviewer opening this screen is about to form a view about somebody's
 * money on the strength of what they read here, so the screen's job is to hand
 * them the record and get out of the way. Every line is a dated fact that
 * exists in a table somewhere: introduced on this date, acknowledged that
 * version, signed this NDA, opened these documents, declared the round like
 * this. The founder's declaration is quoted as their statement, attributed and
 * dated, because paraphrasing somebody's account of their own round into a
 * summary is how a record turns into an allegation.
 *
 * Hence the register: no red banners, no "SUSPECTED FRAUD", no score with a
 * colour on it. The one figure is an evidence weight, and it decides the
 * reading order and nothing else -- a heavy file is a file with a lot to read,
 * not a person with a lot to answer for. Copper marks what is live, verdigris
 * marks what has settled, and green and red stay where the house keeps them:
 * on the direction of money.
 *
 * One action exists: mark the lead reviewed with a note. Nothing here bills or
 * suspends anybody, and nothing here should ever learn to.
 */

interface CaseSignal {
  id: string;
  signal: string;
  severity: string;
  reason: string | null;
  subjectType: string;
  createdAt: string;
  contactKinds: string[];
  /** Other introduced investors this same signal row also names. */
  alsoNames: number;
}

interface CaseDisclosure {
  id: string;
  itemType: string;
  itemLabel: string | null;
  occurredAt: string;
}

interface CaseDeclaration {
  id: string;
  outcome: string;
  declaredAt: string;
  attestationVersion: string;
  amountRaised: number | null;
  currency: string | null;
  declaredExternal: string | null;
  declaredByName: string | null;
  namesThisInvestor: boolean;
  undeclaredHere: boolean;
  introducedHere: boolean;
  undeclaredCount: number;
  introducedCount: number;
}

interface TimelineEntry {
  kind: string;
  at: string;
  channel?: string;
  version?: string;
  label?: string;
  count?: number;
  signal?: string;
  severity?: string;
  reason?: string;
  outcome?: string;
}

interface Counterparty {
  name: string | null;
  entity: string | null;
  trustLevel: number;
  ndaVersion: string;
  capturedAt: string;
}

interface CaseFile {
  key: string;
  startup: { id: string; name: string; slug: string | null };
  investor: { id: string; name: string; firm: string | null; type: string | null; slug: string | null };
  introduction: {
    firstContactAt: string;
    channel: string;
    tailEndsAt: string;
    live: boolean;
    termsVersion: string | null;
  } | null;
  acknowledgement: { acknowledgedAt: string; termsVersion: string } | null;
  nda: {
    signedAt: string | null;
    version: string | null;
    sha256: string | null;
    obligationsEndAt: string | null;
    counterparty: Counterparty | null;
  } | null;
  disclosures: CaseDisclosure[];
  disclosureCount: number;
  disclosuresTruncated: boolean;
  messages: { count: number; lastAt: string | null; atLeast: boolean };
  declarations: CaseDeclaration[];
  signals: CaseSignal[];
  evidence: number;
  timeline: TimelineEntry[];
  lastSignalAt: string;
}

const UI = "'DM Sans', sans-serif";
const MONO = "'JetBrains Mono', monospace";
const SERIF = "var(--font-serif)";

const label: React.CSSProperties = {
  fontFamily: UI, fontWeight: 500, fontSize: "10px", letterSpacing: "0.07em",
  textTransform: "uppercase", color: "var(--cr-ink-4)",
};

const figure: React.CSSProperties = {
  fontFamily: MONO, fontWeight: 600, fontSize: "13px",
  fontVariantNumeric: "tabular-nums", color: "var(--cr-ink)",
};

const dateFigure: React.CSSProperties = {
  fontFamily: MONO, fontWeight: 500, fontSize: "11px",
  fontVariantNumeric: "tabular-nums", color: "var(--cr-ink-4)",
};

const body: React.CSSProperties = {
  fontFamily: UI, fontWeight: 300, fontSize: "13px", lineHeight: 1.65,
  color: "var(--cr-ink-3)",
};

const chipBase: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "5px", borderRadius: "3px",
  padding: "2px 7px", fontFamily: UI, fontWeight: 500, fontSize: "10px",
  letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap",
};

/** Copper is the live state, verdigris the matured one. A tail that has run
 *  out is settled -- nothing closing after it is attributable to anybody. */
const liveChip: React.CSSProperties = {
  ...chipBase, color: "var(--cr-copper)", background: "var(--cr-copper-bg)",
  border: "1px solid var(--cr-copper-br)",
};
const settledChip: React.CSSProperties = {
  ...chipBase, color: "var(--verdigris)", background: "transparent",
  border: "1px solid color-mix(in srgb, var(--verdigris) 35%, transparent)",
};

const primaryBtn: React.CSSProperties = {
  fontFamily: UI, fontWeight: 600, fontSize: "13px", color: "var(--cr-paper)",
  background: "var(--cr-copper)", border: "1px solid var(--cr-copper)",
  borderRadius: "999px", padding: "8px 18px", cursor: "pointer", minHeight: "40px",
};

const textBtn: React.CSSProperties = {
  fontFamily: UI, fontWeight: 500, fontSize: "13px", color: "var(--cr-copper)",
  background: "none", border: "none", padding: "8px 4px", cursor: "pointer",
  textDecoration: "underline", textUnderlineOffset: "3px", minHeight: "40px",
};

const linkStyle: React.CSSProperties = {
  fontFamily: UI, fontWeight: 500, fontSize: "12px",
  color: "var(--cr-copper)", textDecoration: "none",
};

/** The canonical type labels, reused from the investor directory rather than
 *  translated a second time under this namespace. */
const TYPE_KEYS: Record<string, string> = {
  angel: "investors.typeAngel",
  vc: "investors.typeVc",
  family_office: "investors.typeFamilyOffice",
  corporate: "investors.typeCorporate",
};

/** A section opener, never a naked heading. */
function Ruled({ children }: { children: React.ReactNode }) {
  return <p className="ruled-label" style={{ margin: "0 0 8px" }}>{children}</p>;
}

export default function CircumventionQueue({ myLevel }: { myLevel?: string } = {}) {
  const { t } = useTranslation();
  const [cases, setCases] = useState<CaseFile[] | null>(null);
  const [failed, setFailed] = useState(false);
  // The server is the authority; the prop only avoids one render in which a
  // support admin is shown a bench they are not allowed to work.
  const [denied, setDenied] = useState(myLevel === "support");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/circumvention", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) { setDenied(true); setCases([]); return; }
      if (!res.ok) { setFailed(true); setCases([]); return; }
      setCases(data.cases ?? []);
      setDenied(false);
      setFailed(false);
    } catch {
      setFailed(true);
      setCases([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function expand(c: CaseFile) {
    const next = openKey === c.key ? null : c.key;
    setOpenKey(next);
    // One file open at a time keeps one primary action on screen, and a note
    // written about one pair never follows the reviewer to the next.
    setNote("");
  }

  async function markReviewed(c: CaseFile) {
    if (!note.trim()) { notify.error(t("caseFile.noteRequired")); return; }
    setBusy(c.key);
    let res: Response | null = null;
    let data: { error?: string; pairsClosed?: number } = {};
    try {
      res = await fetch("/api/admin/circumvention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startupId: c.startup.id, investorId: c.investor.id, note: note.trim() }),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      data = {};
    } finally {
      setBusy(null);
    }
    if (!res?.ok) { notify.error(data.error || t("errors.generic")); return; }
    // Say how many files that actually closed when it was more than this one.
    const closed = data.pairsClosed ?? 1;
    notify.success(closed > 1 ? t("caseFile.reviewedMany", { count: closed }) : t("caseFile.reviewed"));
    setOpenKey(null);
    setNote("");
    await load();
  }

  /** Machine vocabularies (signals, channels, outcomes, item types) grow
   *  without a deploy. A value that has no key yet still renders as words. */
  const term = (prefix: string, value: string | null | undefined) => {
    if (!value) return "—";
    const key = `caseFile.${prefix}.${value}`;
    const out = t(key);
    return out === key ? value.replace(/_/g, " ") : out;
  };

  const timelineLine = (e: TimelineEntry) => {
    const key = `caseFile.tl.${e.kind}`;
    const out = t(key, {
      channel: term("channelName", e.channel),
      version: e.version ?? "—",
      label: term("itemName", e.label),
      count: e.count ?? 0,
      signal: term("signalName", e.signal),
      outcome: term("outcomeName", e.outcome),
    });
    return out === key ? e.kind.replace(/_/g, " ") : out;
  };

  const list = cases ?? [];

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* The count sits with the title, not pushed to the far edge: at this
          width a lone figure across the page reads as an orphan. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
        <h2 className="ruled-label">{t("caseFile.title")}</h2>
        <span style={{ ...figure, fontSize: "12px", color: "var(--cr-ink-4)" }}>{list.length}</span>
      </div>

      <p style={{ ...body, maxWidth: "62ch", margin: 0 }}>{t("caseFile.subtitle")}</p>

      <div style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", background: "var(--cr-paper)", overflow: "hidden" }}>
        {/* Ledger header. On mobile the columns collapse into the row itself,
            and with nothing in the queue there is nothing to head either --
            column labels over an empty table read as a page that failed to
            load, which is the one impression this surface must not give. */}
        {list.length > 0 && (
          <div
            className="hidden md:grid md:grid-cols-[minmax(0,2.6fr)_80px_120px_110px_24px]"
            style={{ gap: "12px", padding: "10px 16px", background: "var(--cr-paper-2)", borderBottom: "1px solid var(--cr-rule-dark)" }}
          >
            <span style={label}>{t("caseFile.colParties")}</span>
            <span style={label}>{t("caseFile.colEvidence")}</span>
            <span style={label}>{t("caseFile.colTail")}</span>
            <span style={label}>{t("caseFile.colLastSignal")}</span>
            <span />
          </div>
        )}

        {cases === null && <p style={{ ...label, padding: "18px 16px", margin: 0 }}>{t("common.loading")}</p>}

        {cases !== null && list.length === 0 && (
          <div style={{ padding: "48px 16px", textAlign: "center" }}>
            <span aria-hidden style={{ color: "var(--cr-copper)", fontSize: "14px" }}>✦</span>
            <p style={{ ...body, fontSize: "14px", color: "var(--cr-ink-3)", margin: "10px auto 14px", maxWidth: "46ch" }}>
              {denied ? t("caseFile.operatorOnly") : failed ? t("caseFile.loadFailed") : t("caseFile.empty")}
            </p>
            {!denied && (
              <button onClick={() => void load()} style={textBtn}>{t("caseFile.refresh")}</button>
            )}
          </div>
        )}

        {list.map((c) => {
          const open = openKey === c.key;
          const intro = c.introduction;
          return (
            <div key={c.key} style={{ borderBottom: "1px solid var(--cr-rule)" }}>
              <button
                onClick={() => expand(c)}
                aria-expanded={open}
                className="w-full grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.6fr)_80px_120px_110px_24px] md:items-center"
                style={{
                  gap: "12px", padding: "14px 16px", textAlign: "start",
                  background: open ? "var(--cr-paper-3)" : "transparent",
                  border: "none", cursor: "pointer",
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: UI, fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.startup.name || t("caseFile.unnamed")}
                  </span>
                  <span style={{ display: "block", fontFamily: UI, fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.investor.name || t("caseFile.unnamed")}
                    {c.investor.firm ? ` · ${c.investor.firm}` : ""}
                  </span>
                  {/* 375px keeps the two things a reviewer triages on -- how
                      much record there is, and whether a claim is still open. */}
                  {/* `display` stays in the class, not the inline style: an
                      inline display beats md:hidden and the row would then
                      show its mobile summary on the desktop grid too. */}
                  <span className="md:hidden flex" style={{ alignItems: "center", gap: "10px", marginTop: "8px" }}>
                    <span style={{ ...figure, fontSize: "12px" }}>{c.evidence}</span>
                    <span style={intro?.live ? liveChip : settledChip}>
                      {intro?.live ? t("caseFile.inTail") : t("caseFile.tailEnded")}
                    </span>
                  </span>
                </span>
                <span className="hidden md:block" style={figure}>{c.evidence}</span>
                <span className="hidden md:block">
                  <span style={intro?.live ? liveChip : settledChip}>
                    {intro?.live ? t("caseFile.inTail") : t("caseFile.tailEnded")}
                  </span>
                </span>
                <span className="hidden md:block" style={dateFigure}>
                  {c.lastSignalAt ? formatDate(c.lastSignalAt) : "—"}
                </span>
                <span style={{ color: "var(--cr-ink-4)", display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                  {open ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
                </span>
              </button>

              {open && (
                <div style={{ padding: "16px 16px 24px", borderTop: "1px solid var(--cr-rule)", display: "flex", flexDirection: "column", gap: "24px" }}>

                  {/* ── The parties ─────────────────────────────────────── */}
                  <div>
                    <Ruled>{t("caseFile.partiesTitle")}</Ruled>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", alignItems: "baseline" }}>
                      {c.startup.slug ? (
                        <a href={`/startups/${c.startup.slug}`} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                          {c.startup.name || t("caseFile.unnamed")} →
                        </a>
                      ) : (
                        <span style={{ ...body, fontSize: "12px", color: "var(--cr-ink)" }}>{c.startup.name || t("caseFile.unnamed")}</span>
                      )}
                      {c.investor.slug ? (
                        <a href={`/investors/${c.investor.slug}`} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                          {c.investor.name || t("caseFile.unnamed")} →
                        </a>
                      ) : (
                        <span style={{ ...body, fontSize: "12px", color: "var(--cr-ink)" }}>{c.investor.name || t("caseFile.unnamed")}</span>
                      )}
                      {c.investor.type && (
                        <span style={{ ...label, color: "var(--cr-ink-4)" }}>
                          {TYPE_KEYS[c.investor.type] ? t(TYPE_KEYS[c.investor.type]) : c.investor.type.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>

                    {/* Hairline-divided strip: only facts that HAVE values. */}
                    <div style={{ marginTop: "12px", borderTop: "1px solid var(--cr-rule)" }}>
                      {intro && (
                        <Fact label={t("caseFile.introducedLabel")}>
                          <span style={dateFigure}>{formatDate(intro.firstContactAt)}</span>
                          <span style={{ ...body, fontSize: "12px" }}> · {term("channelName", intro.channel)}</span>
                          {intro.termsVersion && (
                            <span style={{ ...dateFigure, marginInlineStart: "8px" }}>{intro.termsVersion}</span>
                          )}
                        </Fact>
                      )}
                      {intro && (
                        <Fact label={intro.live ? t("caseFile.tailEndsLabel") : t("caseFile.tailEndedLabel")}>
                          <span style={dateFigure}>{formatDate(intro.tailEndsAt)}</span>
                        </Fact>
                      )}
                      <Fact label={t("caseFile.ackLabel")}>
                        {c.acknowledgement ? (
                          <>
                            <span style={dateFigure}>{formatDate(c.acknowledgement.acknowledgedAt)}</span>
                            <span style={{ ...dateFigure, marginInlineStart: "8px" }}>{c.acknowledgement.termsVersion}</span>
                          </>
                        ) : (
                          <span style={{ ...body, fontSize: "12px" }}>{t("caseFile.ackNone")}</span>
                        )}
                      </Fact>
                      <Fact label={t("caseFile.messagesLabel")}>
                        {c.messages.count > 0 ? (
                          <>
                            {/* A capped scan can only understate, so the figure
                                is shown as a floor rather than as a total. */}
                            <span style={{ ...figure, fontSize: "12px" }}>
                              {c.messages.atLeast
                                ? t("caseFile.messagesAtLeast", { count: c.messages.count })
                                : c.messages.count}
                            </span>
                            {c.messages.lastAt && (
                              <span style={{ ...dateFigure, marginInlineStart: "8px" }}>{formatDate(c.messages.lastAt)}</span>
                            )}
                          </>
                        ) : (
                          <span style={{ ...body, fontSize: "12px" }}>{t("caseFile.messagesNone")}</span>
                        )}
                      </Fact>
                    </div>
                  </div>

                  {/* ── The confidentiality undertaking ─────────────────── */}
                  <div>
                    <Ruled>{t("caseFile.ndaTitle")}</Ruled>
                    {!c.nda ? (
                      <p style={{ ...body, fontSize: "12px", margin: 0 }}>{t("caseFile.ndaNone")}</p>
                    ) : (
                      <div style={{ borderTop: "1px solid var(--cr-rule)" }}>
                        <Fact label={t("caseFile.ndaSignedLabel")}>
                          {c.nda.signedAt ? (
                            <span style={{ ...dateFigure, color: "var(--verdigris)" }}>{formatDate(c.nda.signedAt)}</span>
                          ) : (
                            <span style={{ ...body, fontSize: "12px" }}>{t("caseFile.ndaUnsigned")}</span>
                          )}
                          {c.nda.version && <span style={{ ...dateFigure, marginInlineStart: "8px" }}>{c.nda.version}</span>}
                        </Fact>
                        {c.nda.sha256 && (
                          <Fact label={t("caseFile.ndaHashLabel")}>
                            <span style={{ ...dateFigure, wordBreak: "break-all" }}>{c.nda.sha256}</span>
                          </Fact>
                        )}
                        {c.nda.obligationsEndAt && (
                          <Fact label={t("caseFile.ndaObligationsLabel")}>
                            <span style={dateFigure}>{formatDate(c.nda.obligationsEndAt)}</span>
                          </Fact>
                        )}
                        {c.nda.counterparty && (
                          <Fact label={t("caseFile.ndaCounterpartyLabel")}>
                            <span style={{ ...body, fontSize: "12px", color: "var(--cr-ink)" }}>
                              {c.nda.counterparty.name || t("caseFile.unnamed")}
                              {c.nda.counterparty.entity ? ` · ${c.nda.counterparty.entity}` : ""}
                            </span>
                            <span style={{ ...dateFigure, marginInlineStart: "8px" }}>
                              {t("caseFile.ndaTrustAtSigning", { level: c.nda.counterparty.trustLevel })}
                            </span>
                          </Fact>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── The founder's own statement ─────────────────────── */}
                  <div>
                    <Ruled>{t("caseFile.declarationTitle")}</Ruled>
                    {c.declarations.length === 0 ? (
                      <p style={{ ...body, fontSize: "12px", margin: 0 }}>{t("caseFile.declarationNone")}</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {c.declarations.map((d) => (
                          <div key={d.id} style={{ borderInlineStart: "2px solid var(--cr-copper-br)", paddingInlineStart: "14px" }}>
                            {/* Quoted, attributed and dated. A declaration is
                                what a person said about their own round; the
                                bench reads it in their words or not at all. */}
                            <p style={{ fontFamily: SERIF, fontWeight: 400, fontSize: "16px", lineHeight: 1.5, color: "var(--cr-ink)", margin: 0 }}>
                              {t("caseFile.declarationQuote", { outcome: term("outcomeName", d.outcome) })}
                            </p>
                            <p style={{ ...dateFigure, margin: "6px 0 0" }}>
                              {t("caseFile.declarationBy", {
                                name: d.declaredByName || t("caseFile.declarationAnon"),
                                date: formatDate(d.declaredAt),
                                version: d.attestationVersion,
                              })}
                            </p>
                            <div style={{ marginTop: "10px", borderTop: "1px solid var(--cr-rule)" }}>
                              <Fact label={t("caseFile.declarationAmountLabel")}>
                                {d.amountRaised !== null ? (
                                  <span style={figure}>{formatMoney(d.amountRaised, d.currency)}</span>
                                ) : (
                                  <span style={{ ...body, fontSize: "12px" }}>{t("caseFile.declarationNoAmount")}</span>
                                )}
                              </Fact>
                              <Fact label={t("caseFile.declarationCrossLabel")}>
                                <span style={{ ...body, fontSize: "12px", color: "var(--cr-ink)" }}>
                                  {t("caseFile.declarationCross", { undeclared: d.undeclaredCount, introduced: d.introducedCount })}
                                </span>
                              </Fact>
                              <Fact label={t("caseFile.declarationThisPairLabel")}>
                                <span style={{ ...body, fontSize: "12px", color: d.undeclaredHere ? "var(--cr-ink)" : "var(--cr-ink-3)" }}>
                                  {d.namesThisInvestor
                                    ? t("caseFile.declarationNames")
                                    : d.undeclaredHere
                                      ? t("caseFile.declarationOmits")
                                      : t("caseFile.declarationOutsideTail")}
                                </span>
                              </Fact>
                              {d.declaredExternal && (
                                <Fact label={t("caseFile.declarationExternalLabel")}>
                                  <span style={{ ...body, fontSize: "12px", color: "var(--cr-ink)", whiteSpace: "pre-wrap" }}>
                                    {d.declaredExternal}
                                  </span>
                                </Fact>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── The ledger of dated facts ───────────────────────── */}
                  <div>
                    <Ruled>{t("caseFile.recordTitle")}</Ruled>
                    {c.timeline.length === 0 ? (
                      <p style={{ ...body, fontSize: "12px", margin: 0 }}>{t("caseFile.recordNone")}</p>
                    ) : (
                      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                        {c.timeline.map((e, i) => (
                          <li
                            key={`${e.kind}-${e.at}-${i}`}
                            className="grid grid-cols-[24px_minmax(0,1fr)] md:grid-cols-[24px_100px_minmax(0,1fr)]"
                            style={{ gap: "12px", padding: "8px 0", borderTop: i === 0 ? "1px solid var(--cr-rule)" : "none", borderBottom: "1px solid var(--cr-rule)", alignItems: "baseline" }}
                          >
                            <span style={{ ...dateFigure, color: "var(--cr-copper)" }}>
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span className="hidden md:block" style={dateFigure}>{formatDate(e.at)}</span>
                            <span style={{ ...body, fontSize: "13px", color: "var(--cr-ink)" }}>
                              {timelineLine(e)}
                              <span className="md:hidden block" style={{ ...dateFigure, marginTop: "2px" }}>
                                {formatDate(e.at)}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  {/* ── What was actually handed over ───────────────────── */}
                  <div>
                    <Ruled>{t("caseFile.disclosureTitle")}</Ruled>
                    {c.disclosureCount === 0 ? (
                      <p style={{ ...body, fontSize: "12px", margin: 0 }}>{t("caseFile.disclosureNone")}</p>
                    ) : (
                      <>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "420px" }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid var(--cr-rule)" }}>
                                <th style={{ ...label, textAlign: "start", padding: "6px 12px 6px 0" }}>{t("caseFile.colDate")}</th>
                                <th style={{ ...label, textAlign: "start", padding: "6px 12px 6px 0" }}>{t("caseFile.colItem")}</th>
                                <th style={{ ...label, textAlign: "start", padding: "6px 0" }}>{t("caseFile.colLabel")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.disclosures.map((d) => (
                                <tr key={d.id} style={{ borderBottom: "1px solid var(--cr-rule)" }}>
                                  <td style={{ padding: "8px 12px 8px 0", ...dateFigure }}>{formatDate(d.occurredAt)}</td>
                                  <td style={{ padding: "8px 12px 8px 0", fontFamily: UI, fontWeight: 500, fontSize: "12px", color: "var(--cr-ink)" }}>
                                    {term("itemName", d.itemType)}
                                  </td>
                                  <td style={{ padding: "8px 0", ...body, fontSize: "12px" }}>{d.itemLabel || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Only when the table is not the whole log. Saying
                            "showing 6 of 6" under six visible rows is noise. */}
                        {(c.disclosures.length < c.disclosureCount || c.disclosuresTruncated) && (
                          <p style={{ ...body, fontSize: "11px", margin: "8px 0 0" }}>
                            {t("caseFile.disclosureShowing", { shown: c.disclosures.length, total: c.disclosureCount })}
                            {c.disclosuresTruncated ? ` ${t("caseFile.disclosureTruncated")}` : ""}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* ── What was raised, and by what ────────────────────── */}
                  <div>
                    <Ruled>{t("caseFile.signalsTitle")}</Ruled>
                    {c.signals.length === 0 ? (
                      <p style={{ ...body, fontSize: "12px", margin: 0 }}>{t("caseFile.signalsNone")}</p>
                    ) : (
                      <div style={{ borderTop: "1px solid var(--cr-rule)" }}>
                        {c.signals.map((s) => (
                          <div key={s.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--cr-rule)" }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
                              <span style={{ fontFamily: UI, fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)" }}>
                                {term("signalName", s.signal)}
                              </span>
                              <span style={{ ...label, color: s.severity === "high" || s.severity === "medium" ? "var(--cr-copper)" : "var(--cr-ink-4)" }}>
                                {term("sev", s.severity)}
                              </span>
                              <span style={dateFigure}>{formatDate(s.createdAt)}</span>
                            </div>
                            {s.reason && (
                              <p style={{ ...body, fontSize: "12px", margin: "4px 0 0" }}>{term("reasonName", s.reason)}</p>
                            )}
                            {s.contactKinds.length > 0 && (
                              <p style={{ ...body, fontSize: "12px", margin: "4px 0 0" }}>
                                {t("caseFile.contactKinds", { kinds: s.contactKinds.map((k) => term("contactKind", k)).join(", ") })}
                              </p>
                            )}
                            {/* One round-level row can be the lead behind
                                several files. Closing this one closes those,
                                so the reviewer is told before the click and
                                not by the queue quietly emptying. */}
                            {s.alsoNames > 0 && (
                              <p style={{ ...body, fontSize: "12px", margin: "4px 0 0", color: "var(--cr-ink)" }}>
                                {t("caseFile.signalShared", { count: s.alsoNames })}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── The one action ──────────────────────────────────── */}
                  <div style={{ borderTop: "1px solid var(--cr-rule-dark)", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                    <Ruled>{t("caseFile.reviewTitle")}</Ruled>
                    <p style={{ ...body, fontSize: "12px", margin: 0, maxWidth: "62ch" }}>{t("caseFile.reviewExplainer")}</p>
                    <div>
                      <label htmlFor={`case-note-${c.key}`} style={{ ...label, display: "block", marginBottom: "6px" }}>
                        {t("caseFile.noteLabel")}
                      </label>
                      <textarea
                        id={`case-note-${c.key}`}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        placeholder={t("caseFile.notePlaceholder")}
                        style={{
                          width: "100%", fontFamily: UI, fontWeight: 300, fontSize: "13px",
                          color: "var(--cr-ink)", background: "var(--cr-paper-2)",
                          border: "1px solid var(--cr-rule-dark)", borderRadius: "4px",
                          padding: "10px 12px", resize: "vertical",
                        }}
                      />
                    </div>
                    <div>
                      <button
                        onClick={() => void markReviewed(c)}
                        disabled={busy === c.key}
                        style={{ ...primaryBtn, opacity: busy === c.key ? 0.45 : 1 }}
                      >
                        {busy === c.key ? t("common.saving") : t("caseFile.markReviewed")}
                      </button>
                    </div>
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

/** One labelled fact on a hairline rule. No nested boxes: inside a card,
 *  structure is rules. */
function Fact({ label: name, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)]"
      style={{ gap: "2px 16px", padding: "8px 0", borderBottom: "1px solid var(--cr-rule)", alignItems: "baseline" }}
    >
      <span style={label}>{name}</span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}
