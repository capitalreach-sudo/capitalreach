import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction, atLeast } from "@/lib/admin-guard";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";
import { evidenceChecklist, expiryFrom, reviewLane, scoreRisk, type EvidenceKind, type RiskFlag, type SubjectType, type TrustLevel } from "@/lib/trust";

/**
 * One reviewer, one decision, the whole outcome written at once.
 *
 * A verification that updates the case but not the subject is a decision
 * nobody can see, and a subject updated without its case is a badge with no
 * evidence behind it. Approving therefore writes three things in one act:
 * the case (status, level, reviewer, expiry), the subject's rung on the trust
 * ladder, and the legacy verified_at/verification_checks pair the existing
 * badge and its popover still read.
 *
 * The one thing a single reviewer may NOT do is clear a blocked case. A
 * sanctions hit, or a risk score at 50 or above, is a legal question rather
 * than a judgement call, so it takes an owner-level admin.
 */

const DECISIONS = ["approve", "reject", "more"] as const;
type Decision = (typeof DECISIONS)[number];

/** Only a case still waiting on a human can be decided. */
const OPEN_STATUSES = ["submitted", "in_review", "needs_more"];

const NOTE_MAX = 1000;

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
    });
  }
  return out;
}

/**
 * The badge popover predates the ladder and speaks a four-word vocabulary.
 * Translating the granted level's evidence into it keeps every existing
 * surface -- listing cards, investor profiles, the verified popover -- true
 * without a second write path.
 */
const LEGACY_CHECK_OF: Partial<Record<EvidenceKind, string>> = {
  email_domain: "domain",
  domain_control: "domain",
  identity_document: "identity",
  liveness: "identity",
  company_registry: "registry",
  director_authority: "registry",
  bank_account: "metrics",
  accreditation: "metrics",
  revenue_proof: "metrics",
  fund_proof: "metrics",
};

function legacyChecks(kinds: EvidenceKind[]): string[] {
  const out: string[] = [];
  for (const k of kinds) {
    const legacy = LEGACY_CHECK_OF[k];
    if (legacy && !out.includes(legacy)) out.push(legacy);
  }
  return out;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const body = await req.json().catch(() => ({}));
  const caseId = body?.caseId;
  const decision = body?.decision as Decision;
  const noteRaw = typeof body?.note === "string" ? body.note.trim() : "";
  const note = noteRaw.slice(0, NOTE_MAX);

  if (!isUuid(caseId) || !DECISIONS.includes(decision)) {
    return NextResponse.json({ error: "caseId and decision required" }, { status: 400 });
  }
  // A refusal or a request for more must say what was wrong. An applicant who
  // is told "no" with no reason writes to support, and support asks us.
  if (decision !== "approve" && !note) {
    return NextResponse.json({ error: "A note is required so the applicant knows what to fix." }, { status: 400 });
  }

  const { data: kase } = await admin
    .from("verification_cases")
    .select("id, subject_type, subject_id, owner_id, status, level_requested, risk_score, risk_flags")
    .eq("id", caseId)
    .maybeSingle();
  if (!kase) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  if (!OPEN_STATUSES.includes(kase.status)) {
    return NextResponse.json({ error: "This case has already been decided." }, { status: 409 });
  }

  const flags = parseRiskFlags(kase.risk_flags);
  const score = typeof kase.risk_score === "number" ? kase.risk_score : scoreRisk(flags);
  const lane = reviewLane(score, flags);
  const subjectType = kase.subject_type as SubjectType;

  if (decision === "approve" && lane === "blocked" && !atLeast(guard.level, "owner")) {
    return NextResponse.json(
      {
        error: "A blocked case cannot be approved by one reviewer. It needs an owner-level admin.",
        requiresOwner: true,
        lane,
      },
      { status: 403 },
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // ── Approve ───────────────────────────────────────────────────────────
  if (decision === "approve") {
    // A reviewer may grant less than was asked for -- evidence for level 2
    // that arrived on a level 4 application is still worth a level 2 badge --
    // but never more, since the evidence above it was never collected.
    const asked = kase.level_requested;
    const requested = body?.level;
    const level = (typeof requested === "number" && Number.isInteger(requested) ? requested : asked) as TrustLevel;
    if (level < 1 || level > asked) {
      return NextResponse.json({ error: `Grant a level between 1 and ${asked}.` }, { status: 400 });
    }
    const expiresIso = expiryFrom(now).toISOString();

    // A case outlives the listing it was raised against (that is the point of
    // owner_id), so check the subject is still there BEFORE the case is
    // marked approved -- otherwise a deleted listing leaves a decided case
    // whose badge was never written, and the queue has nothing left to show.
    const { data: subjectRow } = subjectType === "startup"
      ? await admin.from("startups").select("id").eq("id", kase.subject_id).maybeSingle()
      : await admin.from("investors").select("id").eq("id", kase.subject_id).maybeSingle();
    if (!subjectRow) {
      return NextResponse.json({ error: "The subject of this case no longer exists." }, { status: 409 });
    }

    // What the badge popover will claim. Evidence that actually passed is the
    // truth; where a case was decided on judgement alone, the level's own
    // checklist is the honest floor.
    const { data: passed } = await admin
      .from("verification_evidence")
      .select("kind")
      .eq("case_id", caseId)
      .eq("status", "passed");
    const passedKinds = (passed ?? []).map((e) => e.kind as EvidenceKind);
    const checks = passedKinds.length
      ? legacyChecks(passedKinds)
      : legacyChecks(evidenceChecklist(level, subjectType));

    const { error: caseErr } = await admin
      .from("verification_cases")
      .update({
        status: "approved",
        level_granted: level,
        reviewer_id: guard.adminId,
        reviewed_at: nowIso,
        expires_at: expiresIso,
        decision_note: note || null,
        updated_at: nowIso,
      })
      .eq("id", caseId);
    if (caseErr) return NextResponse.json({ error: "Could not record the decision" }, { status: 500 });

    const trust = {
      trust_level: level,
      trust_reviewed_at: nowIso,
      trust_expires_at: expiresIso,
      // The legacy pair. Both badges tell the same story until the old one
      // is retired.
      verified_at: nowIso,
      verified_by: guard.adminId,
      verification_checks: { checks, at: nowIso, level },
    };

    let ownerId: string | null = null;
    let subjectName = "";
    if (subjectType === "startup") {
      const { data: startup, error } = await admin
        .from("startups")
        // Verifying is a re-check, so the "edited since approval" flag clears
        // with it, exactly as /api/admin/startup/verify does.
        .update({ ...trust, edited_since_review_at: null })
        .eq("id", kase.subject_id)
        .select("id, owner_id, name")
        .maybeSingle();
      if (error || !startup) return NextResponse.json({ error: "Could not update the company" }, { status: 500 });
      ownerId = startup.owner_id;
      subjectName = startup.name;
    } else {
      const { data: investor, error } = await admin
        .from("investors")
        .update(trust)
        .eq("id", kase.subject_id)
        .select("id, owner_id, display_name")
        .maybeSingle();
      if (error || !investor) return NextResponse.json({ error: "Could not update the investor" }, { status: 500 });
      ownerId = investor.owner_id;
      subjectName = investor.display_name ?? "";
    }

    await logAdminAction(admin, guard.adminId, "verification_approve", subjectType, kase.subject_id, {
      case_id: caseId,
      level_granted: level,
      level_requested: asked,
      risk_score: score,
      lane,
      expires_at: expiresIso,
      note: note || null,
    });

    await notifyUser({
      userId: ownerId ?? kase.owner_id,
      type: "verified",
      title: "Verification approved",
      body: `${subjectName} now stands at trust level ${level}.`,
      titleKey: "reviewQueue.notifyApprovedTitle",
      bodyKey: "reviewQueue.notifyApprovedBody",
      params: { name: subjectName, level, date: expiresIso.slice(0, 10) },
      href: subjectType === "startup" ? "/dashboard/startup" : "/dashboard/investor",
    });

    return NextResponse.json({ ok: true, status: "approved", level, expiresAt: expiresIso });
  }

  // ── Reject, or ask for more ───────────────────────────────────────────
  const status = decision === "reject" ? "rejected" : "needs_more";
  const { error: updErr } = await admin
    .from("verification_cases")
    .update({
      status,
      // Rejection grants nothing, and says so rather than leaving the column
      // null, which reads as "not yet decided". A case sent back for more is
      // still open, so it keeps no reviewed_at.
      ...(decision === "reject" ? { level_granted: 0, reviewed_at: nowIso } : {}),
      reviewer_id: guard.adminId,
      decision_note: note,
      updated_at: nowIso,
    })
    .eq("id", caseId);
  if (updErr) return NextResponse.json({ error: "Could not record the decision" }, { status: 500 });

  await logAdminAction(admin, guard.adminId, `verification_${decision === "reject" ? "reject" : "more"}`, subjectType, kase.subject_id, {
    case_id: caseId,
    risk_score: score,
    lane,
    note,
  });

  // The applicant's own channel is `verified`; a refusal and a request for
  // evidence are operator signals, which is what admin_alert is for -- and it
  // carries an icon that does not congratulate someone for being turned down.
  await notifyUser({
    userId: kase.owner_id,
    type: "admin_alert",
    title: decision === "reject" ? "Verification not granted" : "More evidence needed",
    body: note,
    titleKey: decision === "reject" ? "reviewQueue.notifyRejectedTitle" : "reviewQueue.notifyMoreTitle",
    bodyKey: decision === "reject" ? "reviewQueue.notifyRejectedBody" : "reviewQueue.notifyMoreBody",
    params: { note },
    href: subjectType === "startup" ? "/dashboard/startup" : "/dashboard/investor",
  });

  return NextResponse.json({ ok: true, status });
}
