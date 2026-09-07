import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction, atLeast } from "@/lib/admin-guard";
import { scoreRisk, reviewLane, type RiskFlag, type ReviewLane, type EvidenceKind, type EvidenceMethod, type CaseStatus, type SubjectType } from "@/lib/trust";

/**
 * The reviewer's queue.
 *
 * This is the ONLY route from which verification evidence can be read.
 * `verification_evidence` and `trust_signals` carry RLS with no permissive
 * policy, so no client key reaches them at all -- a reviewer sees a passport
 * check because this handler proved they are an operator first, and every
 * listing is written to the admin log because "who looked at whose documents"
 * is an auditable question.
 *
 * Two things never leave here: the raw storage path (a path is a durable
 * handle to a document -- what the reviewer gets is a signed URL that dies in
 * two minutes) and, for anyone below operator, the risk score. The score is
 * revoked from client keys in migration 111 for the same reason it is never
 * shown to the applicant: a published score is a score people optimise
 * against.
 */

export const dynamic = "force-dynamic";

/** Cases waiting on a human. Decided cases are history, not a queue. */
const OPEN_STATUSES = ["submitted", "in_review", "needs_more"] as const;

/** Manual uploads live here; a path may already name its own bucket. */
const EVIDENCE_BUCKET = "verification-evidence";
const KNOWN_BUCKETS = [EVIDENCE_BUCKET, "startup-assets", "deal-documents"];

/** Long enough to open the document, short enough to be useless if it leaks. */
const SIGNED_URL_TTL_SECONDS = 120;

function splitStoragePath(raw: string): { bucket: string; path: string } {
  const slash = raw.indexOf("/");
  if (slash > 0) {
    const head = raw.slice(0, slash);
    if (KNOWN_BUCKETS.includes(head)) return { bucket: head, path: raw.slice(slash + 1) };
  }
  return { bucket: EVIDENCE_BUCKET, path: raw };
}

/** risk_flags is jsonb, so it is whatever was written -- treat it as hostile. */
function parseRiskFlags(raw: unknown): RiskFlag[] {
  if (!Array.isArray(raw)) return [];
  const out: RiskFlag[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.signal !== "string") continue;
    const severity = rec.severity;
    out.push({
      signal: rec.signal,
      severity: severity === "low" || severity === "medium" || severity === "high" ? severity : "info",
      detail: rec.detail && typeof rec.detail === "object" ? (rec.detail as Record<string, unknown>) : undefined,
    });
  }
  return out;
}

// Not exported: a route module may only export its handlers, so the queue
// component declares the mirror of these shapes on its own side.
interface QueueEvidence {
  id: string;
  kind: EvidenceKind;
  method: EvidenceMethod;
  status: string;
  detail: Record<string, unknown>;
  checkedAt: string | null;
  /** Signed, short-lived, minted per request. Null when there is no file. */
  fileUrl: string | null;
}

interface QueueCase {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  subjectName: string;
  subjectSlug: string | null;
  ownerEmail: string;
  status: CaseStatus;
  levelRequested: number;
  levelGranted: number | null;
  riskScore: number;
  riskFlags: Array<{ signal: string; severity: RiskFlag["severity"] }>;
  lane: ReviewLane;
  decisionNote: string | null;
  createdAt: string;
  evidence: QueueEvidence[];
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const params = new URL(req.url).searchParams;
  const statusParam = params.get("status");
  const statuses = statusParam && (OPEN_STATUSES as readonly string[]).includes(statusParam)
    ? [statusParam]
    : [...OPEN_STATUSES];
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 100);

  const { data: rows, error } = await admin
    .from("verification_cases")
    .select("id, subject_type, subject_id, owner_id, status, level_requested, level_granted, risk_score, risk_flags, decision_note, created_at")
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: "Could not load the queue" }, { status: 500 });

  const cases = rows ?? [];
  const caseIds = cases.map((c) => c.id);
  const startupIds = cases.filter((c) => c.subject_type === "startup").map((c) => c.subject_id);
  const investorIds = cases.filter((c) => c.subject_type === "investor").map((c) => c.subject_id);
  const ownerIds = Array.from(new Set(cases.map((c) => c.owner_id)));

  // Named columns only. Migration 109 revoked the financial columns of
  // `startups` from client keys, and a select star here would drag them
  // through an admin route that has no business with them.
  const [{ data: startups }, { data: investors }, { data: owners }, { data: evidence }] = await Promise.all([
    startupIds.length
      ? admin.from("startups").select("id, name, slug").in("id", startupIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; slug: string }> }),
    investorIds.length
      ? admin.from("investors").select("id, display_name, slug").in("id", investorIds)
      : Promise.resolve({ data: [] as Array<{ id: string; display_name: string | null; slug: string }> }),
    ownerIds.length
      ? admin.from("profiles").select("id, email").in("id", ownerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; email: string }> }),
    caseIds.length
      ? admin
          .from("verification_evidence")
          .select("id, case_id, kind, method, status, detail, storage_path, checked_at")
          .in("case_id", caseIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as Array<Record<string, never>> }),
  ]);

  const startupById = new Map((startups ?? []).map((s) => [s.id, s]));
  const investorById = new Map((investors ?? []).map((i) => [i.id, i]));
  const emailById = new Map((owners ?? []).map((p) => [p.id, p.email]));

  // Sign every upload in one pass. A failed signature (a bucket that does not
  // exist yet, a file since deleted) degrades to "no link" rather than
  // failing the whole queue -- the rest of the case is still reviewable.
  type EvidenceRow = { id: string; case_id: string; kind: string; method: string; status: string; detail: unknown; storage_path: string | null; checked_at: string | null };
  const evidenceRows = (evidence ?? []) as unknown as EvidenceRow[];
  const signed = await Promise.all(
    evidenceRows.map(async (e) => {
      if (!e.storage_path) return null;
      const { bucket, path } = splitStoragePath(e.storage_path);
      try {
        const { data } = await admin.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
        return data?.signedUrl ?? null;
      } catch {
        return null;
      }
    }),
  );

  const evidenceByCase = new Map<string, QueueEvidence[]>();
  evidenceRows.forEach((e, i) => {
    const list = evidenceByCase.get(e.case_id) ?? [];
    list.push({
      id: e.id,
      kind: e.kind as EvidenceKind,
      method: e.method as EvidenceMethod,
      status: e.status,
      detail: e.detail && typeof e.detail === "object" ? (e.detail as Record<string, unknown>) : {},
      checkedAt: e.checked_at,
      fileUrl: signed[i],
    });
    evidenceByCase.set(e.case_id, list);
  });

  const payload: QueueCase[] = cases.map((c) => {
    const flags = parseRiskFlags(c.risk_flags);
    // A case scored before a signal landed still routes on what it holds now:
    // the stored score is authoritative, the flags are the fallback.
    const score = typeof c.risk_score === "number" ? c.risk_score : scoreRisk(flags);
    const subject = c.subject_type === "startup" ? startupById.get(c.subject_id) : investorById.get(c.subject_id);
    const name = c.subject_type === "startup"
      ? (subject as { name?: string } | undefined)?.name
      : (subject as { display_name?: string | null } | undefined)?.display_name;
    return {
      id: c.id,
      subjectType: c.subject_type as SubjectType,
      subjectId: c.subject_id,
      subjectName: name || "",
      subjectSlug: (subject as { slug?: string } | undefined)?.slug ?? null,
      ownerEmail: emailById.get(c.owner_id) ?? "",
      status: c.status as CaseStatus,
      levelRequested: c.level_requested,
      levelGranted: c.level_granted,
      riskScore: score,
      riskFlags: flags.map((f) => ({ signal: f.signal, severity: f.severity })),
      lane: reviewLane(score, flags),
      decisionNote: c.decision_note,
      createdAt: c.created_at,
      evidence: evidenceByCase.get(c.id) ?? [],
    };
  });

  // Reading evidence is itself an act worth recording: this is the log an
  // auditor reads to answer "who saw this applicant's identity documents".
  await logAdminAction(admin, guard.adminId, "verification_list", "platform", null, {
    statuses,
    cases: payload.length,
    case_ids: caseIds,
    evidence_signed: signed.filter(Boolean).length,
  });

  return NextResponse.json({
    cases: payload,
    viewerLevel: guard.level,
    // Sanctions and high-risk cases need a second pair of eyes; the queue
    // greys its own primary action rather than letting a reviewer discover
    // the rule from a 403.
    canDecideBlocked: atLeast(guard.level, "owner"),
  });
}
