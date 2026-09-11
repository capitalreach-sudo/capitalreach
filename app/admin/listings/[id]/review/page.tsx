"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Navbar } from "@/components/shared/navbar";
import { notify } from "@/components/ui/toast-notify";
import { formatDate } from "@/lib/utils";
import { registerLookupUrl } from "@/lib/register-check";
import type { Checklist, ItemOutcome, ReviewOutcome } from "@/lib/review/checklists";

/**
 * The reviewer's bench for one listing.
 *
 * A client page rather than a server shell with a client child, because every
 * read here goes through /api/admin/review, which re-checks the admin level
 * with the service-role client. Middleware already keeps non-admins off
 * /admin; the route is what actually guards the data, and it would guard it
 * identically if this page were reached some other way.
 *
 * Approve stays disabled until every required item passes. The button is a
 * courtesy: the route refuses the same approval on its own, so a reviewer
 * cannot get past it by posting directly, and the two rules are written from
 * the same checklist definition rather than restated here.
 *
 * The reviewer and the time are never typed in. They are the admin the route
 * authenticated and the moment the row was written.
 */

interface ReviewRow {
  id: string;
  checklist_version: string;
  items: unknown;
  outcome: string;
  outcome_reason: string | null;
  reviewed_at: string;
  reviewer_id: string | null;
}

interface Payload {
  subjectType: "startup" | "investor";
  subject: {
    id: string;
    name: string | null;
    slug: string | null;
    status: string | null;
    website?: string | null;
    legalEntityName?: string | null;
    registerType?: string | null;
    registerNumber?: string | null;
    editedSinceReviewAt?: string | null;
  };
  attestation: {
    attestedAt: string | null;
    version: string | null;
    sha256: string | null;
    current: boolean;
  } | null;
  checklist: Checklist;
  lastReview: ReviewRow | null;
  viewerLevel: string;
}

const UI = "'DM Sans', sans-serif";
const MONO = "'JetBrains Mono', monospace";

const label: React.CSSProperties = {
  fontFamily: UI, fontWeight: 500, fontSize: "10px", letterSpacing: "0.07em",
  textTransform: "uppercase", color: "var(--cr-ink-4)",
};

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

const textArea: React.CSSProperties = {
  width: "100%", fontFamily: UI, fontWeight: 300, fontSize: "13px",
  color: "var(--cr-ink)", background: "var(--cr-paper-2)",
  border: "1px solid var(--cr-rule-dark)", borderRadius: "4px",
  padding: "10px 12px", resize: "vertical",
};

const OUTCOME_CHOICES: Array<{ value: ItemOutcome; text: string }> = [
  { value: "pass", text: "Pass" },
  { value: "fail", text: "Fail" },
  { value: "na", text: "N/A" },
];

function outcomeColor(outcome: ItemOutcome | undefined): string {
  if (outcome === "pass") return "var(--verdigris)";
  if (outcome === "fail") return "var(--cr-down)";
  if (outcome === "na") return "var(--cr-ink-4)";
  return "var(--cr-rule-dark)";
}

export default function ListingReviewPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, ItemOutcome>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [noteToSubject, setNoteToSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ReviewOutcome | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/review?subjectType=startup&subjectId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setData(null);
        setLoadError(body?.error || "Could not load this listing.");
        return;
      }
      setData(body as Payload);
    } catch {
      setData(null);
      setLoadError("Could not load this listing.");
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const checklist = data?.checklist ?? null;
  const answeredAll = !!checklist && checklist.items.every((i) => !!answers[i.key]);
  const requiredPassed = !!checklist && checklist.items.every((i) => !i.required || answers[i.key] === "pass");
  const blockers = checklist ? checklist.items.filter((i) => i.required && answers[i.key] !== "pass") : [];

  async function submit(outcome: ReviewOutcome) {
    if (!data || busy) return;
    if (!answeredAll) {
      notify.error("Every item needs an answer, including the ones that were not done.");
      return;
    }
    if (outcome !== "approved" && !reason.trim()) {
      notify.error("Write what was found, so the next reviewer can pick this up.");
      return;
    }
    setBusy(true);
    let res: Response | null = null;
    let body: { error?: string; blockers?: string[] } = {};
    try {
      res = await fetch("/api/admin/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectType: "startup",
          subjectId: id,
          outcome,
          outcomeReason: reason.trim() || undefined,
          noteToSubject: noteToSubject.trim() || undefined,
          items: (checklist?.items ?? []).map((i) => ({
            key: i.key,
            outcome: answers[i.key],
            note: notes[i.key]?.trim() || undefined,
          })),
        }),
      });
      body = await res.json().catch(() => ({}));
    } catch {
      body = {};
    } finally {
      setBusy(false);
    }
    if (!res?.ok) {
      notify.error(body.error || "Could not record the review.");
      return;
    }
    setDone(outcome);
    notify.success(
      outcome === "approved" ? "Review recorded. The listing is live."
      : outcome === "rejected" ? "Review recorded. The listing is not live."
      : "Review recorded. Changes requested.",
    );
    await load();
  }

  const registerUrl = registerLookupUrl(data?.subject.registerType, data?.subject.registerNumber);

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "80vh" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "100px 24px 64px" }}>
          <Link href="/admin" style={{ ...label, color: "var(--cr-copper)", textDecoration: "none" }}>
            &larr; Admin
          </Link>

          <div className="ruled-label" style={{ margin: "16px 0" }}>Listing review</div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700,
            fontSize: "clamp(24px,3.4vw,36px)", color: "var(--cr-ink)",
            letterSpacing: "-0.02em", marginBottom: "8px",
          }}>
            {data?.subject.name || "Listing"}
          </h1>

          {loadError && (
            <div style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "16px 18px", marginTop: "16px" }}>
              <p style={{ fontFamily: UI, fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)", margin: 0 }}>{loadError}</p>
              <button onClick={() => void load()} style={{ ...textBtn, color: "var(--cr-copper)" }}>Try again</button>
            </div>
          )}

          {!data && !loadError && (
            <p style={{ ...label, marginTop: "16px" }}>Loading</p>
          )}

          {data && checklist && (
            <>
              {/* ── The subject ────────────────────────────────────────── */}
              <div style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", background: "var(--cr-paper-2)", padding: "16px 18px", marginTop: "20px", display: "grid", gap: "10px" }}>
                <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", alignItems: "baseline" }}>
                  <span style={label}>Status</span>
                  <span style={{ fontFamily: MONO, fontSize: "12px", color: "var(--cr-ink)" }}>{data.subject.status ?? "unknown"}</span>
                  {data.subject.slug && (
                    <a href={`/startups/${data.subject.slug}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: UI, fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>
                      Open the listing &rarr;
                    </a>
                  )}
                  {data.subject.website && (
                    <a href={data.subject.website} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: UI, fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>
                      Website &rarr;
                    </a>
                  )}
                </div>

                {/* Admin-only, and never rendered anywhere an investor can
                    reach. An entity name beside a register number finds the
                    founders and the shareholders in a minute. */}
                <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", alignItems: "baseline" }}>
                  <span style={label}>Register identity</span>
                  <span style={{ fontFamily: MONO, fontSize: "12px", color: "var(--cr-ink-2)" }}>
                    {data.subject.legalEntityName || "no legal entity on file"}
                    {data.subject.registerNumber ? ` / ${data.subject.registerNumber}` : ""}
                    {data.subject.registerType ? ` / ${data.subject.registerType}` : ""}
                  </span>
                  {registerUrl && (
                    <a href={registerUrl} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: UI, fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "none" }}>
                      Open the register &rarr;
                    </a>
                  )}
                </div>

                <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", alignItems: "baseline" }}>
                  <span style={label}>Founder attestation</span>
                  <span style={{ fontFamily: UI, fontWeight: 400, fontSize: "12.5px", color: data.attestation?.current ? "var(--verdigris)" : "var(--cr-copper)" }}>
                    {!data.attestation?.attestedAt
                      ? "Not signed"
                      : data.attestation.current
                        ? `Signed ${formatDate(data.attestation.attestedAt)}, current wording`
                        : `Signed ${formatDate(data.attestation.attestedAt)} under ${data.attestation.version ?? "an older version"}`}
                  </span>
                </div>

                {data.subject.editedSinceReviewAt && (
                  <p style={{ fontFamily: UI, fontWeight: 400, fontSize: "12.5px", color: "var(--cr-copper)", margin: 0 }}>
                    Edited since the last review, on {formatDate(data.subject.editedSinceReviewAt)}.
                  </p>
                )}
              </div>

              {/* ── The previous verdict ───────────────────────────────── */}
              {data.lastReview && (
                <div style={{ border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "14px 16px", marginTop: "14px" }}>
                  <p style={{ ...label, margin: "0 0 6px" }}>Previous review</p>
                  <p style={{ fontFamily: UI, fontWeight: 400, fontSize: "12.5px", color: "var(--cr-ink-2)", margin: 0 }}>
                    {data.lastReview.outcome.replace(/_/g, " ")} on {formatDate(data.lastReview.reviewed_at)}, list {data.lastReview.checklist_version}.
                  </p>
                  {data.lastReview.outcome_reason && (
                    <p style={{ fontFamily: UI, fontWeight: 300, fontSize: "12.5px", lineHeight: 1.6, color: "var(--cr-ink-3)", margin: "6px 0 0" }}>
                      {data.lastReview.outcome_reason}
                    </p>
                  )}
                </div>
              )}

              {/* ── The list ───────────────────────────────────────────── */}
              <div style={{ marginTop: "26px" }}>
                <h2 className="ruled-label" style={{ marginBottom: "6px" }}>{checklist.version}</h2>
                <p style={{ fontFamily: UI, fontWeight: 300, fontSize: "13px", lineHeight: 1.65, color: "var(--cr-ink-3)", maxWidth: "62ch", margin: "0 0 16px" }}>
                  Every method below is shown to investors word for word. Answer each item, including the ones that were not done: an item left off the record reads to a viewer as an item that passed.
                </p>

                <div style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", background: "var(--cr-paper)", overflow: "hidden" }}>
                  {checklist.items.map((item) => (
                    <div key={item.key} style={{ borderBottom: "1px solid var(--cr-rule)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: UI, fontWeight: 600, fontSize: "13.5px", color: "var(--cr-ink)" }}>
                          {item.label}
                          {item.required && (
                            <span style={{ ...label, marginInlineStart: "8px", color: "var(--cr-copper)" }}>Required</span>
                          )}
                        </span>
                        <span role="group" aria-label={item.label} style={{ display: "inline-flex", gap: "6px" }}>
                          {OUTCOME_CHOICES.map((c) => {
                            const on = answers[item.key] === c.value;
                            return (
                              <button
                                key={c.value}
                                onClick={() => setAnswers((a) => ({ ...a, [item.key]: c.value }))}
                                aria-pressed={on}
                                style={{
                                  fontFamily: UI, fontWeight: 500, fontSize: "11px", letterSpacing: "0.05em",
                                  textTransform: "uppercase", borderRadius: "3px", padding: "5px 10px",
                                  cursor: "pointer", minHeight: "32px",
                                  color: on ? "var(--cr-paper)" : "var(--cr-ink-3)",
                                  background: on ? outcomeColor(c.value) : "transparent",
                                  border: `1px solid ${on ? outcomeColor(c.value) : "var(--cr-rule-dark)"}`,
                                }}
                              >
                                {c.text}
                              </button>
                            );
                          })}
                        </span>
                      </div>

                      <p style={{ fontFamily: UI, fontWeight: 300, fontSize: "12.5px", lineHeight: 1.6, color: "var(--cr-ink-3)", margin: 0 }}>
                        {item.method}
                      </p>

                      <textarea
                        aria-label={`Note on ${item.label}`}
                        value={notes[item.key] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [item.key]: e.target.value }))}
                        rows={1}
                        maxLength={500}
                        placeholder="Note for the next reviewer. Not shown to the founder or to investors."
                        style={{ ...textArea, fontSize: "12.5px" }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* ── The verdict ────────────────────────────────────────── */}
              <div style={{ marginTop: "24px", borderTop: "1px solid var(--cr-rule-dark)", paddingTop: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label htmlFor="review-reason" style={{ ...label, display: "block", marginBottom: "6px" }}>
                    What was found. For the next reviewer, never shown to the founder
                  </label>
                  <textarea
                    id="review-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    style={textArea}
                  />
                </div>

                <div>
                  <label htmlFor="review-subject-note" style={{ ...label, display: "block", marginBottom: "6px" }}>
                    What to tell the founder. Sent to them as written
                  </label>
                  <textarea
                    id="review-subject-note"
                    value={noteToSubject}
                    onChange={(e) => setNoteToSubject(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    style={textArea}
                  />
                </div>

                {!requiredPassed && (
                  <p style={{ fontFamily: UI, fontWeight: 400, fontSize: "12.5px", color: "var(--cr-ink-3)", margin: 0 }}>
                    Approve is off until these pass: {blockers.map((b) => b.label).join(", ")}.
                  </p>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => void submit("approved")}
                    disabled={busy || !answeredAll || !requiredPassed}
                    style={{
                      ...primaryBtn,
                      opacity: busy || !answeredAll || !requiredPassed ? 0.45 : 1,
                      cursor: busy || !answeredAll || !requiredPassed ? "not-allowed" : "pointer",
                    }}
                  >
                    {busy ? "Saving" : "Approve and publish"}
                  </button>
                  <button onClick={() => void submit("changes_requested")} disabled={busy || !answeredAll}
                    style={{ ...quietBtn, opacity: busy || !answeredAll ? 0.45 : 1 }}>
                    Request changes
                  </button>
                  <button onClick={() => void submit("rejected")} disabled={busy || !answeredAll}
                    style={{ ...textBtn, opacity: busy || !answeredAll ? 0.45 : 1 }}>
                    Reject
                  </button>
                </div>

                {done && (
                  <p style={{ fontFamily: UI, fontWeight: 400, fontSize: "12.5px", color: "var(--cr-ink-3)", margin: 0 }}>
                    Recorded as {done.replace(/_/g, " ")}. The reviewer and the time were taken from this session.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
