import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { dbRateLimit, RATE } from "@/lib/db-rate-limit";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { carriedEvidence, evidenceChecklist, scoreRisk, type RiskFlag, type SubjectType, type TrustLevel } from "@/lib/trust";
import {
  DOMAIN_VERIFY_PREFIX,
  computeRiskFlags,
  domainVerifyRecord,
  emailDomain,
  normaliseDomain,
} from "@/lib/trust-signals";

// computeRiskFlags and the token HMAC both reach for node crypto and the
// service role, neither of which exists on the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The applicant's own case: open one, retarget it, submit it.
 *
 * One case per subject at a time. A member who reloads the page, changes their
 * mind about the level, or comes back a week later lands on the SAME row --
 * duplicates would split their evidence across two applications and put the
 * same company in the reviewer's queue twice.
 *
 * risk_score and risk_flags are written here and never read back out. They are
 * revoked from client keys in migration 111, and an applicant who can see
 * their own score is an applicant who can tune their application against it.
 */

/** Statuses that still belong to the applicant. Decided cases are history. */
const OPEN_STATUSES = ["draft", "submitted", "in_review", "needs_more"];

/** Where the applicant may still change things. */
const EDITABLE_STATUSES = ["draft", "needs_more"];

/** What the applicant is allowed to know about their own case. */
interface CaseView {
  id: string;
  status: string;
  levelRequested: number;
  levelGranted: number | null;
  decisionNote: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function clampLevel(raw: unknown, fallback: TrustLevel): TrustLevel {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(4, Math.max(1, Math.round(n))) as TrustLevel;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  // Opening a case runs the detectors, which read several tables per call.
  const { max, windowMs } = RATE.perHour(30);
  const limit = await dbRateLimit(user.id, "verification_case", max, windowMs);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts", messageKey: "verify.tooMany" },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action === "submit" ? "submit" : "open";
  const admin = createAdminClient();

  // ── The subject: what is being verified ──────────────────────────────────
  // A person is not verified here; their company or their investor profile is.
  const wanted: SubjectType | null =
    body?.subjectType === "startup" || body?.subjectType === "investor" ? body.subjectType : null;

  const [startup, investor] = await Promise.all([
    wanted === "investor"
      ? Promise.resolve({ data: null })
      : admin.from("startups").select("id, name, website").eq("owner_id", user.id)
          .order("created_at", { ascending: true }).limit(1).maybeSingle(),
    wanted === "startup"
      ? Promise.resolve({ data: null })
      : admin.from("investors").select("id, display_name, website").eq("owner_id", user.id)
          .order("created_at", { ascending: true }).limit(1).maybeSingle(),
  ]);

  const subjectType: SubjectType | null = startup.data ? "startup" : investor.data ? "investor" : null;
  const subjectId = startup.data?.id ?? investor.data?.id ?? null;
  const subjectSite = startup.data?.website ?? investor.data?.website ?? null;
  if (!subjectType || !subjectId) {
    return NextResponse.json(
      { error: "Nothing to verify yet", messageKey: "verify.noSubjectBody" },
      { status: 404 },
    );
  }

  // ── The case ─────────────────────────────────────────────────────────────
  const { data: existing } = await admin
    .from("verification_cases")
    .select("id, status, level_requested, level_granted, decision_note, expires_at, created_at, updated_at")
    .eq("owner_id", user.id)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .in("status", OPEN_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let row = existing;

  if (!row) {
    const { data: created, error } = await admin
      .from("verification_cases")
      .insert({
        subject_type: subjectType,
        subject_id: subjectId,
        owner_id: user.id,
        status: "draft",
        level_requested: clampLevel(body?.levelRequested, 2),
      })
      .select("id, status, level_requested, level_granted, decision_note, expires_at, created_at, updated_at")
      .single();
    if (error || !created) {
      console.error("verification case insert failed:", error);
      return NextResponse.json({ error: "Could not open an application" }, { status: 500 });
    }
    row = created;
  } else if (body?.levelRequested != null && EDITABLE_STATUSES.includes(row.status)) {
    // Retargeting a draft is free; a submitted case is the reviewer's.
    const level = clampLevel(body.levelRequested, row.level_requested as TrustLevel);
    if (level !== row.level_requested) {
      const { data: updated } = await admin
        .from("verification_cases")
        .update({ level_requested: level, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .select("id, status, level_requested, level_granted, decision_note, expires_at, created_at, updated_at")
        .single();
      if (updated) row = updated;
    }
  }

  // ── What the last approval already proved ────────────────────────────────
  // Only while the case is still the applicant's: what a reviewer is reading
  // must not gain rows under them.
  if (EDITABLE_STATUSES.includes(row.status)) {
    await carryForwardEvidence(admin, row.id, subjectType, subjectId, user.id);
  }

  // ── A check nobody has to perform ────────────────────────────────────────
  // The account's confirmed address already sits at the company domain, which
  // the server knows without asking. It is supporting evidence, not proof of
  // control -- anyone with a mailbox at a domain passes it -- so it is
  // recorded as email_domain and never as domain_control.
  await recordEmailDomain(admin, row.id, user.email, user.email_confirmed_at, subjectSite);

  // ── Submission ───────────────────────────────────────────────────────────
  if (action === "submit") {
    if (!EDITABLE_STATUSES.includes(row.status)) {
      return NextResponse.json(
        { error: "This application is already with a reviewer", messageKey: "verify.alreadySubmitted" },
        { status: 409 },
      );
    }

    const { data: evidence } = await admin
      .from("verification_evidence")
      .select("kind, status")
      .eq("case_id", row.id);

    const held = new Set(
      (evidence ?? [])
        .filter((e) => e.status === "passed" || e.status === "pending")
        .map((e) => e.kind),
    );
    const missing = evidenceChecklist(row.level_requested as TrustLevel, subjectType)
      .filter((kind) => !held.has(kind));
    if (missing.length) {
      return NextResponse.json(
        { error: "Some evidence is still outstanding", messageKey: "verify.submitIncomplete", missing },
        { status: 400 },
      );
    }

    // Scoring routes the work; it never decides it. A detector that throws
    // must not cost the applicant their submission, so the case goes in
    // unscored and the reviewer sees it in the standard lane.
    let flags: RiskFlag[] = [];
    try {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
      flags = await computeRiskFlags({ subjectType, subjectId, ownerId: user.id, ip });
    } catch (err) {
      console.warn("[verification] risk scoring skipped:", err);
    }

    const { data: submitted, error } = await admin
      .from("verification_cases")
      .update({
        status: "submitted",
        risk_score: scoreRisk(flags),
        risk_flags: JSON.parse(JSON.stringify(flags)),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("id, status, level_requested, level_granted, decision_note, expires_at, created_at, updated_at")
      .single();
    if (error || !submitted) {
      console.error("verification case submit failed:", error);
      return NextResponse.json({ error: "Could not submit the application" }, { status: 500 });
    }
    row = submitted;
  }

  const view: CaseView = {
    id: row.id,
    status: row.status,
    levelRequested: row.level_requested,
    levelGranted: row.level_granted,
    decisionNote: row.decision_note,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  return NextResponse.json({
    ok: true,
    subjectType,
    case: view,
    // The proof value is derived from the case id and only ever handed to the
    // owner of that case, which is why the checker refuses to echo it back.
    domainRecord: {
      host: `_${DOMAIN_VERIFY_PREFIX.split("-")[0]}`,
      value: domainVerifyRecord(row.id),
    },
  });
}

/**
 * Bring forward what the subject's last approval already stands on.
 *
 * Evidence is stored per case, so a new application starts empty and a member
 * who holds level 2 is asked to prove their domain again to reach level 3.
 * `carriedEvidence` decides what may travel; this writes COPIES, because the
 * approved case has to stay whole -- it is the record its own decision was made
 * from, and the sweep still reads it to detect drift.
 *
 * Idempotent per kind, so a draft opened before any of this existed picks up
 * its evidence on the next call, and a domain proof the applicant has since
 * re-run and failed is never resurrected by a second copy landing beside it.
 *
 * Best effort, like the email-domain check below: a copy that fails leaves the
 * applicant supplying the evidence themselves, which beats an application that
 * will not open.
 */
async function carryForwardEvidence(
  admin: ReturnType<typeof createAdminClient>,
  caseId: string,
  subjectType: SubjectType,
  subjectId: string,
  ownerId: string,
): Promise<void> {
  try {
    // Scoped to the owner as well as the subject: a listing that changed hands
    // must not hand its new owner the previous owner's identity evidence.
    const { data: grant } = await admin
      .from("verification_cases")
      .select("id, level_granted, expires_at")
      .eq("owner_id", ownerId)
      .eq("subject_type", subjectType)
      .eq("subject_id", subjectId)
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (!grant) return;

    const [{ data: source }, { data: already }] = await Promise.all([
      admin
        .from("verification_evidence")
        .select("kind, method, status, vendor_ref, detail, checked_at, created_at")
        .eq("case_id", grant.id),
      admin.from("verification_evidence").select("kind").eq("case_id", caseId),
    ]);

    const present = new Set((already ?? []).map((e) => e.kind));
    const carried = carriedEvidence(
      // An automated check stamps checked_at; anything that never carried one
      // is dated by the row, which is the reading the trust sweep takes too.
      (source ?? []).map((e) => ({ ...e, checkedAt: e.checked_at ?? e.created_at })),
      { levelGranted: grant.level_granted, expiresAt: grant.expires_at },
      subjectType,
    ).filter((e) => !present.has(e.kind));
    if (!carried.length) return;

    const { error } = await admin.from("verification_evidence").insert(
      carried.map((e) => {
        const detail = e.detail && typeof e.detail === "object" && !Array.isArray(e.detail) ? e.detail : {};
        return {
          case_id: caseId,
          kind: e.kind,
          method: e.method,
          status: e.status,
          vendor_ref: e.vendor_ref,
          // storage_path stays behind. Two rows pointing at one object means a
          // replacement uploaded here deletes the file the decided case is the
          // record of; `carried_from` names the case that still holds it.
          detail: { ...detail, carried_from: grant.id },
          // The check happened when it happened, and the copy says so even
          // where it has to borrow the source row's own date. Restamping it
          // would put a year-old proof at today, and the next case after this
          // one would inherit that lie rather than ask for the check again.
          checked_at: e.checkedAt,
        };
      }),
    );
    if (error) console.warn("[verification] evidence carry-forward failed:", error);
  } catch (err) {
    console.warn("[verification] evidence carry-forward skipped:", err);
  }
}

/**
 * Write the email-at-domain row once, if it is true. Best effort: this is a
 * bonus observation, and failing to store it must not fail the application.
 */
async function recordEmailDomain(
  admin: ReturnType<typeof createAdminClient>,
  caseId: string,
  email: string | null | undefined,
  confirmedAt: string | null | undefined,
  website: string | null,
): Promise<void> {
  try {
    if (!confirmedAt) return;
    const mail = emailDomain(email);
    const site = normaliseDomain(website);
    if (!mail || !site || normaliseDomain(mail) !== site) return;

    const { data: already } = await admin
      .from("verification_evidence")
      .select("id")
      .eq("case_id", caseId)
      .eq("kind", "email_domain")
      .maybeSingle();
    if (already) return;

    await admin.from("verification_evidence").insert({
      case_id: caseId,
      kind: "email_domain",
      method: "automated",
      status: "passed",
      detail: { domain: site, source: "confirmed_account_email" },
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[verification] email-domain evidence skipped:", err);
  }
}
