"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Paperclip } from "lucide-react";
import { LedgerLoader } from "@/components/ui/LedgerLoader";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * A member's conversations, read by an admin.
 *
 * A transcript, not a mailbox. The house chat is bubbles, alternating sides,
 * a composer at the foot; this is a dated register with a sender column and a
 * hairline under every entry, because the reader is not a party to any of it
 * and the screen should never let them forget that for a second. There is no
 * composer, no reply, no delete: the surface has no write path at all, and the
 * one action it offers is choosing which conversation to open.
 *
 * Masked messages are shown twice on purpose. The delivered text is what the
 * recipient actually read; underneath it, the message as typed, with the parts
 * the mask withheld marked in place. An investigator asked to judge whether
 * somebody tried to take a deal off-platform cannot do it from the sentence
 * that survived the mask -- the attempt is precisely the part that was
 * removed, which is why body_original exists.
 *
 * Reads GET /api/admin/messages, which logs the read before returning content:
 *   ?memberType=investor|startup&memberId=<uuid>              -> { threads: [] }
 *   ?memberType=...&memberId=...&threadId=<uuid>              -> { messages: [] }
 */

interface InspectedThread {
  id: string;
  status: string | null;
  counterpartyName: string | null;
  messageCount: number;
  /** Messages in this thread whose delivered text differs from what was typed. */
  maskedCount: number;
  lastMessageAt: string | null;
}

interface InspectedMessage {
  id: string;
  createdAt: string | null;
  senderName: string | null;
  fromMember: boolean;
  body: string;
  /** Present only where the mask changed the text. */
  bodyOriginal: string | null;
  maskedKinds: string[];
  scamKinds: string[];
  attachmentName: string | null;
}

/**
 * The sentence the mask writes in place of each value it withholds.
 * lib/message-safety keeps its constant private and this file may not export
 * it from there, so the literal is repeated. A drift costs the inline marking
 * and nothing else: without a match the pair falls back to two whole bodies,
 * which is still the delivered text and still the text as typed.
 */
const WITHHOLD_MARK = "[contact details withheld until a deal is open]";

const UI = "'DM Sans', sans-serif";
const MONO = "'JetBrains Mono', monospace";

const label: React.CSSProperties = {
  fontFamily: UI, fontWeight: 500, fontSize: "10px", letterSpacing: "0.07em",
  textTransform: "uppercase", color: "var(--cr-ink-4)",
};

const dateFigure: React.CSSProperties = {
  fontFamily: MONO, fontWeight: 500, fontSize: "11px",
  fontVariantNumeric: "tabular-nums", color: "var(--cr-ink-4)",
};

const prose: React.CSSProperties = {
  fontFamily: UI, fontWeight: 300, fontSize: "13px", lineHeight: 1.65,
  color: "var(--cr-ink-3)", margin: 0, overflowWrap: "anywhere",
};

const bodyText: React.CSSProperties = {
  fontFamily: UI, fontWeight: 300, fontSize: "14px", lineHeight: 1.65,
  color: "var(--cr-ink)", margin: 0,
  whiteSpace: "pre-wrap", overflowWrap: "anywhere",
};

const textBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "8px",
  minHeight: "40px", padding: "8px 4px", cursor: "pointer",
  background: "none", border: "none",
  fontFamily: UI, fontWeight: 500, fontSize: "13px", color: "var(--cr-copper)",
};

const chip: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", borderRadius: "3px",
  padding: "2px 7px", fontFamily: UI, fontWeight: 500, fontSize: "10px",
  letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap",
  color: "var(--cr-copper)", background: "var(--cr-copper-bg)",
  border: "1px solid var(--cr-copper-br)",
};

/** What the recipient never saw: copper ground plus a rule, so the marking
 *  survives a theme that flattens colour and a reader who cannot see it. */
const withheldSpan: React.CSSProperties = {
  background: "var(--cr-copper-bg)", color: "var(--cr-ink)",
  borderBottom: "1px solid var(--cr-copper)", borderRadius: "2px",
  padding: "0 2px",
};

type Span = { withheld: boolean; text: string };

/**
 * Line the delivered text up against the original so the difference can be
 * shown in place rather than as two paragraphs to compare by eye.
 *
 * The mask substitutes a fixed sentence for each value, so the text between
 * substitutions is untouched and can be found in the original in order. Any
 * failure to line them up returns null rather than a guess: a wrong alignment
 * here would attribute words to somebody that they did not write.
 */
function alignWithheld(delivered: string, original: string): Span[] | null {
  const parts = delivered.split(WITHHOLD_MARK);
  if (parts.length < 2) return null;

  const spans: Span[] = [];
  let cursor = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (i === 0) {
      if (!original.startsWith(part)) return null;
      if (part) spans.push({ withheld: false, text: part });
      cursor = part.length;
      continue;
    }

    const isLast = i === parts.length - 1;

    // An empty part means two substitutions ran together. The withheld run
    // carries on to the next piece of surviving text, so leave the cursor.
    if (!part) {
      if (isLast) {
        const tail = original.slice(cursor);
        if (tail) spans.push({ withheld: true, text: tail });
        cursor = original.length;
      }
      continue;
    }

    const at = isLast ? original.lastIndexOf(part) : original.indexOf(part, cursor);
    if (at < cursor) return null;
    if (isLast && at + part.length !== original.length) return null;

    const gap = original.slice(cursor, at);
    if (gap) spans.push({ withheld: true, text: gap });
    spans.push({ withheld: false, text: part });
    cursor = at + part.length;
  }

  if (cursor !== original.length) return null;
  return spans.some((s) => s.withheld) ? spans : null;
}

// The route serialises database rows whose columns are snake_case. Both
// spellings are read so a payload that passes a column name straight through
// renders the same as one that has been renamed on the way out.
type Raw = Record<string, unknown>;

function pickString(row: Raw, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function pickNumber(row: Raw, ...keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0;
}

function pickStrings(row: Raw, ...keys: string[]): string[] {
  for (const k of keys) {
    const v = row[k];
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  }
  return [];
}

function toThread(row: Raw): InspectedThread {
  return {
    id: pickString(row, "id", "threadId", "thread_id") ?? "",
    status: pickString(row, "status"),
    counterpartyName: pickString(row, "counterpartyName", "counterparty_name", "counterparty", "name"),
    messageCount: pickNumber(row, "messageCount", "message_count", "count"),
    maskedCount: pickNumber(row, "maskedCount", "masked_count", "withheldCount", "withheld_count"),
    lastMessageAt: pickString(row, "lastMessageAt", "last_message_at", "lastAt", "created_at"),
  };
}

function toMessage(row: Raw): InspectedMessage {
  const flags = row.safety_flags ?? row.safetyFlags;
  const nested: Raw = flags && typeof flags === "object" ? (flags as Raw) : {};
  return {
    id: pickString(row, "id") ?? "",
    createdAt: pickString(row, "createdAt", "created_at"),
    senderName: pickString(row, "senderName", "sender_name"),
    fromMember: row.fromMember === true || row.from_member === true || row.side === "member",
    body: pickString(row, "body", "text") ?? "",
    bodyOriginal: pickString(row, "bodyOriginal", "body_original"),
    maskedKinds: [
      ...pickStrings(row, "maskedKinds", "masked_kinds", "masked"),
      ...pickStrings(nested, "masked"),
    ].filter((k, i, all) => all.indexOf(k) === i),
    scamKinds: [
      ...pickStrings(row, "scamKinds", "scam_kinds", "scam"),
      ...pickStrings(nested, "scam"),
    ].filter((k, i, all) => all.indexOf(k) === i),
    attachmentName: pickString(row, "attachmentName", "attachment_name"),
  };
}

export function MemberMessages({ memberType, memberId, memberName }: {
  memberType: "investor" | "startup";
  memberId: string;
  memberName: string;
}) {
  const { t } = useTranslation();

  const [threads, setThreads] = useState<InspectedThread[] | null>(null);
  const [threadsFailed, setThreadsFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InspectedMessage[] | null>(null);
  const [messagesFailed, setMessagesFailed] = useState(false);
  // Non-null when the transcript is incomplete, so the surface can say so.
  const [more, setMore] = useState<null | { total: number; loaded: number }>(null);

  // The last thread asked for. A slow first response must not overwrite the
  // transcript of a second one that has already landed.
  const wanted = useRef<string | null>(null);

  const base = `/api/admin/messages?memberType=${memberType}&memberId=${encodeURIComponent(memberId)}`;

  const loadThreads = useCallback(async () => {
    setThreads(null);
    setThreadsFailed(false);
    try {
      const res = await fetch(base, { cache: "no-store" });
      if (!res.ok) { setThreadsFailed(true); return; }
      const data = await res.json();
      const rows = Array.isArray(data?.threads) ? (data.threads as Raw[]) : [];
      setThreads(rows.map(toThread).filter((th) => th.id));
    } catch {
      setThreadsFailed(true);
    }
  }, [base]);

  useEffect(() => { void loadThreads(); }, [loadThreads]);

  // Only the list arrives unasked. Reading what two people said to each other
  // costs a deliberate click, and that click is what the audit log records.
  const openThread = useCallback(async (threadId: string, offset = 0) => {
    wanted.current = threadId;
    setOpenId(threadId);
    if (offset === 0) { setMessages(null); setMore(null); }
    setMessagesFailed(false);
    try {
      // The page window is asked for and READ. Without it the route's default
      // of 100 arrived silently, so a long conversation rendered its first
      // hundred messages and simply stopped -- and an investigator reads that
      // as the end of the conversation. On this surface a truncation nobody
      // is told about is worse than a slow page.
      const res = await fetch(
        `${base}&threadId=${encodeURIComponent(threadId)}&limit=200&offset=${offset}`,
        { cache: "no-store" },
      );
      if (wanted.current !== threadId) return;
      if (!res.ok) { setMessagesFailed(true); return; }
      const data = await res.json();
      if (wanted.current !== threadId) return;
      const rows = Array.isArray(data?.messages) ? (data.messages as Raw[]) : [];
      const mapped = rows.map(toMessage);
      setMessages(prev => (offset === 0 || !prev ? mapped : [...prev, ...mapped]));
      const pg = data?.page;
      setMore(pg && pg.hasMore
        ? { total: Number(pg.total) || 0, loaded: offset + rows.length }
        : null);
    } catch {
      if (wanted.current === threadId) setMessagesFailed(true);
    }
  }, [base]);

  /** Machine vocabularies grow without a deploy; an unknown value still
   *  renders as words rather than as a missing key. */
  const term = (prefix: string, value: string) => {
    const key = `memberMessages.${prefix}.${value}`;
    const out = t(key);
    return out === key ? value.replace(/_/g, " ") : out;
  };

  const stamp = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    }) : "--";

  const open = threads?.find((th) => th.id === openId) ?? null;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "32px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
        <h2 className="ruled-label">{t("memberMessages.title")}</h2>
        <span style={chip}>{t("memberMessages.readOnly")}</span>
      </div>

      <p style={{ ...prose, maxWidth: "62ch" }}>
        {t("memberMessages.subtitle", { name: memberName })}
      </p>

      {/* Said to the operator, on the surface itself. A tool that reads
          private correspondence and hides its own logging from the person
          using it is asking them to trust something it will not disclose. */}
      <p style={{
        ...prose, maxWidth: "62ch", color: "var(--cr-ink-2)",
        borderInlineStart: "2px solid var(--cr-copper)", paddingInlineStart: "12px",
      }}>
        {t("memberMessages.auditNotice")}
        {" "}
        {t("memberMessages.readOnlyNote")}
      </p>

      <div style={{
        border: "1px solid var(--cr-rule-dark)", borderRadius: "4px",
        background: "var(--cr-paper)", overflow: "hidden",
      }}>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">

          {/* ── The conversations ───────────────────────────────────────── */}
          {/* One column at a time on a phone: a 280px list beside a transcript
              at 375px would give both of them nothing. */}
          <div
            className={`${openId ? "hidden md:block" : "block"} md:max-h-[560px] md:overflow-y-auto [border-block-end:1px_solid_var(--cr-rule-dark)] md:[border-block-end:none] md:[border-inline-end:1px_solid_var(--cr-rule-dark)]`}
          >
            <p style={{ ...label, padding: "12px 16px", margin: 0, background: "var(--cr-paper-2)" }}>
              {t("memberMessages.threadsLabel")}
            </p>

            {threadsFailed ? (
              <div style={{ padding: "24px 16px" }}>
                <p style={{ ...prose, marginBottom: "4px" }}>{t("memberMessages.loadFailed")}</p>
                <button onClick={() => void loadThreads()} style={textBtn}>
                  {t("memberMessages.retry")}
                </button>
              </div>
            ) : threads === null ? (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <LedgerLoader label={t("memberMessages.loadingThreads")} />
              </div>
            ) : threads.length === 0 ? (
              <p style={{ ...prose, padding: "24px 16px" }}>{t("memberMessages.empty")}</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {threads.map((th) => {
                  const selected = th.id === openId;
                  return (
                    <li key={th.id} style={{ borderBottom: "1px solid var(--cr-rule)" }}>
                      <button
                        onClick={() => void openThread(th.id)}
                        aria-current={selected ? "true" : undefined}
                        style={{
                          display: "block", width: "100%", minHeight: "56px",
                          padding: "12px 16px", textAlign: "start", cursor: "pointer",
                          background: selected ? "var(--cr-paper-3)" : "transparent",
                          border: "none",
                          borderInlineStart: `2px solid ${selected ? "var(--cr-copper)" : "transparent"}`,
                          transition: "background 140ms var(--ease-out)",
                        }}
                      >
                        <span style={{
                          display: "block", fontFamily: UI, fontWeight: 600, fontSize: "13px",
                          color: "var(--cr-ink)", overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {th.counterpartyName || t("memberMessages.unnamed")}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                          <span style={dateFigure}>{stamp(th.lastMessageAt)}</span>
                          <span style={label}>{t("memberMessages.messageCount", { count: th.messageCount })}</span>
                        </span>
                        {/* The count that decides the reading order: a thread
                            with something withheld in it is the one an
                            investigator came here for. */}
                        {th.maskedCount > 0 && (
                          <span style={{ ...chip, marginTop: "8px" }}>
                            {t("memberMessages.withheldCount", { count: th.maskedCount })}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ── The transcript ──────────────────────────────────────────── */}
          <div className={`${openId ? "block" : "hidden md:block"} md:max-h-[560px] md:overflow-y-auto`}>
            <div style={{
              display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
              padding: "12px 16px", background: "var(--cr-paper-2)",
              borderBottom: "1px solid var(--cr-rule)",
            }}>
              {openId && (
                <button onClick={() => { wanted.current = null; setOpenId(null); }}
                  className="md:hidden" style={textBtn}>
                  <ArrowLeft style={{ width: 14, height: 14 }} aria-hidden />
                  {t("memberMessages.back")}
                </button>
              )}
              <span style={label}>{t("memberMessages.transcriptLabel")}</span>
              {open && (
                <span style={{ fontFamily: UI, fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {open.counterpartyName || t("memberMessages.unnamed")}
                </span>
              )}
              {open?.status && <span style={label}>{term("status", open.status)}</span>}
            </div>

            <div style={{ padding: "0 16px" }}>
              {!openId ? (
                <p style={{ ...prose, padding: "48px 0", textAlign: "center" }}>
                  {t("memberMessages.selectPrompt")}
                </p>
              ) : messagesFailed ? (
                <div style={{ padding: "32px 0" }}>
                  <p style={{ ...prose, marginBottom: "4px" }}>{t("memberMessages.threadFailed")}</p>
                  <button onClick={() => void openThread(openId)} style={textBtn}>
                    {t("memberMessages.retry")}
                  </button>
                </div>
              ) : messages === null ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
                  <LedgerLoader label={t("memberMessages.loadingThread")} />
                </div>
              ) : messages.length === 0 ? (
                <p style={{ ...prose, padding: "32px 0" }}>{t("memberMessages.threadEmpty")}</p>
              ) : (
                <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {messages.map((m) => {
                    const spans = m.bodyOriginal ? alignWithheld(m.body, m.bodyOriginal) : null;
                    return (
                      <li key={m.id} style={{ padding: "16px 0", borderBottom: "1px solid var(--cr-rule)" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: UI, fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>
                            {m.senderName || (m.fromMember ? t("memberMessages.fromMember") : t("memberMessages.fromCounterparty"))}
                          </span>
                          {/* Which side they are on, only where a name has
                              already been given: without one the name IS the
                              side and the row would say it twice. */}
                          {m.senderName && (
                            <span style={label}>
                              {m.fromMember ? t("memberMessages.fromMember") : t("memberMessages.fromCounterparty")}
                            </span>
                          )}
                          <span style={dateFigure}>{stamp(m.createdAt)}</span>
                        </div>

                        {/* Copper marks the member this page is about. The
                            other side gets the quiet rule: both are being
                            read, only one of them is the subject. */}
                        <div style={{
                          marginTop: "8px", paddingInlineStart: "12px",
                          borderInlineStart: `2px solid ${m.fromMember ? "var(--cr-copper)" : "var(--cr-paper-4)"}`,
                          display: "flex", flexDirection: "column", gap: "10px",
                        }}>
                          {m.bodyOriginal && (
                            <p style={{ ...label, margin: 0 }}>{t("memberMessages.deliveredLabel")}</p>
                          )}
                          <p style={bodyText}><Delivered text={m.body} mark={t("memberMessages.withheldInline")} /></p>

                          {m.attachmentName && (
                            <p style={{ ...prose, display: "inline-flex", alignItems: "center", gap: "8px" }}>
                              <Paperclip style={{ width: 12, height: 12, flexShrink: 0 }} aria-hidden />
                              {t("memberMessages.attachment", { name: m.attachmentName })}
                            </p>
                          )}

                          {/* The message as typed. Without it there is no way
                              to tell an attempt to leave the platform from a
                              sentence that merely mentions a phone. */}
                          {m.bodyOriginal && (
                            <div style={{
                              border: "1px solid var(--cr-copper-br)", borderRadius: "4px",
                              background: "var(--cr-paper-2)", padding: "12px",
                              display: "flex", flexDirection: "column", gap: "8px",
                            }}>
                              <p style={{ ...label, color: "var(--cr-copper)", margin: 0 }}>
                                {t("memberMessages.originalLabel")}
                              </p>
                              <p style={bodyText}>
                                {spans
                                  ? spans.map((s, i) => s.withheld
                                      ? <mark key={i} style={withheldSpan}>{s.text}</mark>
                                      : <Fragment key={i}>{s.text}</Fragment>)
                                  : m.bodyOriginal}
                              </p>
                              <p style={{ ...prose, fontSize: "12px" }}>
                                {spans ? t("memberMessages.originalNote") : t("memberMessages.originalPlainNote")}
                              </p>
                              {m.maskedKinds.length > 0 && (
                                <p style={{ ...label, margin: 0 }}>
                                  {t("memberMessages.withheldKinds", {
                                    kinds: m.maskedKinds.map((k) => term("kind", k)).join(", "),
                                  })}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Ink, not red. What the safety pass thought of a
                              message is an opinion about it; colouring it as
                              an alarm would hand the reader a verdict before
                              they have finished the sentence it is about. */}
                          {m.scamKinds.length > 0 && (
                            <p style={{ ...label, color: "var(--cr-ink-2)", margin: 0 }}>
                              {t("memberMessages.flaggedKinds", {
                                kinds: m.scamKinds.map((k) => term("scam", k)).join(", "),
                              })}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              {/* An incomplete transcript has to say so. A reader who is not
                  told how much is missing will treat the last message on
                  screen as the last message there was. */}
              {more && (
                <div style={{ padding: "16px 0", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                  <span style={{ ...prose, margin: 0 }}>
                    {t("memberMessages.partialTranscript", { loaded: more.loaded, total: more.total })}
                  </span>
                  <button type="button" onClick={() => openId && void openThread(openId, more.loaded)}
                    style={{
                      minHeight: "40px", padding: "0 20px", borderRadius: "999px",
                      background: "transparent", border: "1px solid var(--cr-rule-dark)",
                      color: "var(--cr-ink)", cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px",
                    }}>
                    {t("memberMessages.loadOlder")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The delivered text, with each substitution shown as the gap it is rather
 *  than read as a sentence the sender wrote. */
function Delivered({ text, mark }: { text: string; mark: string }) {
  const parts = text.split(WITHHOLD_MARK);
  if (parts.length < 2) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span style={{
              ...label, color: "var(--cr-copper)", background: "var(--cr-copper-bg)",
              border: "1px dashed var(--cr-copper-br)", borderRadius: "2px",
              padding: "0 8px", margin: "0 4px", display: "inline-block",
            }}>
              {mark}
            </span>
          )}
          {part}
        </Fragment>
      ))}
    </>
  );
}
