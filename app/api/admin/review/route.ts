import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-guard";
import { notifyUser } from "@/lib/notify-user";
import { sendListingLiveEmail } from "@/lib/resend";
import { isUuid } from "@/lib/utils";
import { evaluateGate, gateRefusal, getGateConfig, startupGateSubject } from "@/lib/trust-gates";
import {
  approvalBlockers,
  currentChecklist,
  currentChecklistVersion,
  isItemOutcome,
  isReviewOutcome,
  type ItemOutcome,
  type RecordedItem,
  type ReviewSubjectType,
} from "@/lib/review/checklists";
import { attestationStateFrom } from "@/lib/legal/founder-attestation";

/**
 * The review, recorded.
 *
 * GET hands the reviewer the list in force, the subject beside it, and the
 * previous verdict. POST writes the row and moves the subject in one act. A
 * review that does not change anything is a private note, and a status that
 * changes with no review behind it is the claim this whole migration exists to
 * stop being unanswerable -- so neither happens alone here.
 *
 * Two things this route deliberately does NOT do. It never records a verdict
 * of its own: every item outcome and the overall outcome arrive from a person
 * who had the subject in front of them. And it never reaches a terminal state
 * by inference: an approval with a required item unanswered is refused rather
 * than assumed, because the ledger's value is entirely in the items being
 * answered honestly one at a time.
 *
 * On the two audiences for a refusal. outcome_reason is the reviewer's private
 * note for the next reviewer and 126 is explicit that it never reaches the
 * subject. `noteToSubject` is the separate, deliberate sentence the founder is
 * owed, and it travels in the notification and nowhere near the row. Merging
 * them would put an internal judgement in front of the person it is about.
 */

export const dynamic = "force-dynamic";

const REASON_MAX = 2000;
const SUBJECT_NOTE_MAX = 1000;
const ITEM_NOTE_MAX = 500;

function parseSubjectType(v: unknown): ReviewSubjectType | null {
  return v === "startup" || v === "investor" ? v : null;
}

// One unbroken literal. supabase-js infers the row shape from the TEXT of this
// string, so splitting it with + widens every field to GenericStringError.
const STARTUP_COLUMNS =
  "id, name, slug, status, owner_id, website, legal_entity_name, register_type, register_number, edited_since_review_at, last_review_id, founder_attestation_at, founder_attestation_version, founder_attestation_sha256";

const INVESTOR_COLUMNS = "id, slug, display_name, firm_name, owner_id";

/** The reviewer sees the reviewer and the private reason; a viewer never does,
 *  which is why the investor-facing projection is a different read entirely. */
const REVIEW_COLUMNS = "id, checklist_version, items, outcome, outcome_reason, reviewed_at, reviewer_id";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const subjectType = parseSubjectType(req.nextUrl.searchParams.get("subjectType") ?? "startup");
  const subjectId = req.nextUrl.searchParams.get("subjectId") ?? "";
  if (!subjectType || !isUuid(subjectId)) {
    return NextResponse.json({ error: "subjectType and subjectId required" }, { status: 400 });
  }

  const checklist = currentChecklist(subjectType);

  if (subjectType === "startup") {
    const { data: startup, error } = await admin
      .from("startups")
      .select(STARTUP_COLUMNS)
      .eq("id", subjectId)
      .maybeSingle();
    if (error) {
      console.error("[admin/review] startup read failed:", error.message);
      return NextResponse.json({ error: "Could not load the listing" }, { status: 500 });
    }
    if (!startup) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: review, error: reviewErr } = await admin
      .from("review_checklists")
      .select(REVIEW_COLUMNS)
      .eq("subject_type", "startup")
      .eq("subject_id", subjectId)
      .order("reviewed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reviewErr) {
      // Surfaced rather than swallowed: a reviewer who is not shown the
      // previous verdict has no way to know one exists.
      console.error("[admin/review] last review read failed:", reviewErr.message);
      return NextResponse.json({ error: "Could not load the previous review" }, { status: 500 });
    }

    // The identity columns 125 added are outside the client-key grant and are
    // read here so the `identity` item can actually be answered. Every read of
    // them is logged, the same as the register bench does.
    await logAdminAction(admin, guard.adminId, "review_open", "startup", subjectId, {
      checklist_version: checklist.version,
    });

    return NextResponse.json({
      subjectType,
      subject: {
        id: startup.id,
        name: startup.name,
        slug: startup.slug,
        status: startup.status,
        website: startup.website,
        legalEntityName: startup.legal_entity_name,
        registerType: startup.register_type,
        registerNumber: startup.register_number,
        editedSinceReviewAt: startup.edited_since_review_at,
      },
      attestation: attestationStateFrom(startup),
      checklist,
      lastReview: review ?? null,
      viewerLevel: guard.level,
    });
  }

  const { data: investor, error } = await admin
    .from("investors")
    .select(INVESTOR_COLUMNS)
    .eq("id", subjectId)
    .maybeSingle();
  if (error) {
    console.error("[admin/review] investor read failed:", error.message);
    return NextResponse.json({ error: "Could not load the investor" }, { status: 500 });
  }
  if (!investor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: review, error: reviewErr } = await admin
    .from("review_checklists")
    .select(REVIEW_COLUMNS)
    .eq("subject_type", "investor")
    .eq("subject_id", subjectId)
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reviewErr) {
    console.error("[admin/review] last review read failed:", reviewErr.message);
    return NextResponse.json({ error: "Could not load the previous review" }, { status: 500 });
  }

  await logAdminAction(admin, guard.adminId, "review_open", "investor", subjectId, {
    checklist_version: checklist.version,
  });

  return NextResponse.json({
    subjectType,
    subject: {
      id: investor.id,
      name: investor.display_name ?? investor.firm_name,
      slug: investor.slug,
      status: null,
    },
    attestation: null,
    checklist,
    lastReview: review ?? null,
    viewerLevel: guard.level,
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const body = await req.json().catch(() => ({}));
  const subjectType = parseSubjectType(body?.subjectType);
  const subjectId = typeof body?.subjectId === "string" ? body.subjectId : "";
  const outcome = body?.outcome;
  const outcomeReason = typeof body?.outcomeReason === "string" ? body.outcomeReason.trim().slice(0, REASON_MAX) : "";
  const noteToSubject = typeof body?.noteToSubject === "string" ? body.noteToSubject.trim().slice(0, SUBJECT_NOTE_MAX) : "";

  if (!subjectType || !isUuid(subjectId)) {
    return NextResponse.json({ error: "subjectType and subjectId required" }, { status: 400 });
  }
  if (!isReviewOutcome(outcome)) {
    return NextResponse.json({ error: "outcome must be approved, rejected or changes_requested" }, { status: 400 });
  }
  // A verdict that is not "approved" with nothing written down is a decision
  // the next reviewer cannot pick up, and this row is the only place it lands.
  if (outcome !== "approved" && !outcomeReason) {
    return NextResponse.json({ error: "A reason is required so the next reviewer knows what was found." }, { status: 400 });
  }

  const checklist = currentChecklist(subjectType);
  const version = currentChecklistVersion(subjectType);

  // Answers are indexed by key and then read back through the DEFINITION, so a
  // key the current list does not hold is dropped rather than stored.
  const answers: Record<string, ItemOutcome> = {};
  const notes: Record<string, string> = {};
  if (Array.isArray(body?.items)) {
    for (const raw of body.items) {
      if (!raw || typeof raw !== "object") continue;
      const rec = raw as Record<string, unknown>;
      if (typeof rec.key !== "string" || !isItemOutcome(rec.outcome)) continue;
      answers[rec.key] = rec.outcome;
      if (typeof rec.note === "string" && rec.note.trim()) {
        notes[rec.key] = rec.note.trim().slice(0, ITEM_NOTE_MAX);
      }
    }
  }

  // Every item gets an answer, including the ones that were not done. An item
  // silently absent from the record reads to a viewer as an item that passed,
  // which 126 calls out as the failure a reader cannot detect.
  const unanswered = checklist.items.filter((i) => !answers[i.key]).map((i) => i.key);
  if (unanswered.length) {
    return NextResponse.json(
      { error: "Every item needs an answer, including the ones that were not done.", unanswered },
      { status: 400 },
    );
  }

  if (outcome === "approved") {
    const blockers = approvalBlockers(checklist, answers);
    if (blockers.length) {
      return NextResponse.json(
        { error: "These items have to pass before this can be approved.", blockers },
        { status: 409 },
      );
    }
  }

  const items: RecordedItem[] = checklist.items.map((i) => ({
    key: i.key,
    // The wording travels with the row, so the record still describes itself
    // if this version is ever retired from the code.
    label: i.label,
    method: i.method,
    outcome: answers[i.key],
    note: notes[i.key] ?? null,
  }));

  // ── The subject, before anything is written ─────────────────────────────
  let ownerId: string | null = null;
  let subjectName = "";
  let subjectSlug: string | null = null;
  let currentStatus: string | null = null;

  if (subjectType === "startup") {
    const { data: startup, error } = await admin
      .from("startups")
      .select("id, name, slug, status, owner_id")
      .eq("id", subjectId)
      .maybeSingle();
    if (error) {
      console.error("[admin/review] startup read failed:", error.message);
      return NextResponse.json({ error: "Could not load the listing" }, { status: 500 });
    }
    if (!startup) return NextResponse.json({ error: "Not found" }, { status: 404 });
    ownerId = startup.owner_id;
    subjectName = startup.name ?? "";
    subjectSlug = startup.slug ?? null;
    currentStatus = startup.status ?? null;

    // A suspended or archived listing is not waiting on a review, and an
    // approval here must never be the way one comes back: that decision has
    // its own route, its own level, and its own audit entry.
    if (outcome === "approved" && (currentStatus === "suspended" || currentStatus === "archived")) {
      return NextResponse.json(
        { error: `This listing is ${currentStatus}. Restoring it is a separate decision, not a review outcome.` },
        { status: 409 },
      );
    }

    // The same publish gate /api/admin/startup/approve enforces. Without it
    // this route is simply a second way past it, and the attack that gate
    // stops is the one that cannot be undone: a real company listed by a
    // stranger.
    if (outcome === "approved") {
      const gateSubject = await startupGateSubject(subjectId);
      if (gateSubject) {
        const verdict = evaluateGate("publish", gateSubject, await getGateConfig());
        if (!verdict.allowed) {
          return NextResponse.json(
            {
              ...gateRefusal(verdict),
              adminMessage:
                `Not approved. This listing stands at trust level ${verdict.held} and publishing requires level ${verdict.required}. ` +
                `The review is not recorded, so nothing is lost: the founder has to reach level ${verdict.required} first.`,
            },
            { status: 403 },
          );
        }
      }
    }
  } else {
    const { data: investor, error } = await admin
      .from("investors")
      .select("id, slug, display_name, firm_name, owner_id")
      .eq("id", subjectId)
      .maybeSingle();
    if (error) {
      console.error("[admin/review] investor read failed:", error.message);
      return NextResponse.json({ error: "Could not load the investor" }, { status: 500 });
    }
    if (!investor) return NextResponse.json({ error: "Not found" }, { status: 404 });
    ownerId = investor.owner_id;
    subjectName = investor.display_name ?? investor.firm_name ?? "";
    subjectSlug = investor.slug ?? null;
  }

  // ── The row ─────────────────────────────────────────────────────────────
  const { data: inserted, error: insertErr } = await admin
    .from("review_checklists")
    .insert({
      subject_type: subjectType,
      subject_id: subjectId,
      reviewer_id: guard.adminId,
      checklist_version: version,
      items,
      outcome,
      outcome_reason: outcomeReason || null,
    })
    .select("id, reviewed_at")
    .single();
  if (insertErr || !inserted) {
    console.error("[admin/review] review insert failed:", insertErr?.message);
    return NextResponse.json({ error: "Could not record the review" }, { status: 500 });
  }

  // ── The pointer and the status, together ────────────────────────────────
  if (subjectType === "startup") {
    // draft carries both refusals. The five statuses on `startups` (001) have
    // no value between "not live" and "rejected", and the distinction between
    // a refusal and a request for changes lives in the review row, which is
    // the record built to hold it.
    const nextStatus = outcome === "approved" ? "active" : "draft";
    const { error: updErr } = await admin
      .from("startups")
      .update({
        last_review_id: inserted.id,
        status: nextStatus,
        ...(outcome === "approved"
          ? { listed_at: new Date().toISOString(), edited_since_review_at: null }
          : {}),
      })
      .eq("id", subjectId);
    if (updErr) {
      console.error("[admin/review] startup update failed:", updErr.message);
      // The review stands. Saying so beats a bare 500: a reviewer who retries
      // would otherwise write the same verdict twice without knowing.
      return NextResponse.json(
        { error: "The review was recorded but the listing status did not change. Do not re-submit; tell an engineer.", reviewId: inserted.id },
        { status: 500 },
      );
    }
  } else if (ownerId) {
    // profiles.last_review_id, not investors: 126 puts the column on the
    // member, while review_checklists.subject_id carries investors.id. The
    // hop through owner_id is the only thing joining them.
    const { error: updErr } = await admin
      .from("profiles")
      .update({ last_review_id: inserted.id })
      .eq("id", ownerId);
    if (updErr) {
      console.error("[admin/review] profile update failed:", updErr.message);
      return NextResponse.json(
        { error: "The review was recorded but could not be linked to the member. Do not re-submit; tell an engineer.", reviewId: inserted.id },
        { status: 500 },
      );
    }
  }

  await logAdminAction(admin, guard.adminId, `review_${outcome}`, subjectType, subjectId, {
    review_id: inserted.id,
    checklist_version: version,
    // The outcomes only, never the reviewer's item notes.
    items: Object.fromEntries(checklist.items.map((i) => [i.key, answers[i.key]])),
    previous_status: currentStatus,
  });

  // ── Telling the subject ─────────────────────────────────────────────────
  // The private reason never travels. Only the sentence written for them does.
  if (ownerId && subjectType === "startup") {
    if (outcome === "approved") {
      await notifyUser({
        userId: ownerId,
        type: "listing_approved",
        title: `${subjectName} is live`,
        body: "Your listing is now visible to investors.",
        href: subjectSlug ? `/startups/${subjectSlug}` : "/dashboard/startup",
      }).catch(() => {});

      const { data: owner, error: ownerErr } = await admin
        .from("profiles")
        .select("email")
        .eq("id", ownerId)
        .maybeSingle();
      if (ownerErr) console.warn("[admin/review] owner email read failed:", ownerErr.message);
      if (owner?.email && subjectSlug) {
        await sendListingLiveEmail(owner.email, subjectName, subjectSlug).catch(() => {});
      }
    } else {
      await notifyUser({
        userId: ownerId,
        type: "listing_rejected",
        title: `${subjectName} needs changes before it can go live`,
        body: noteToSubject || "Your listing was reviewed and is not live yet. Open your dashboard to see what to do next.",
        href: "/dashboard/startup",
      }).catch(() => {});
    }
  }

  return NextResponse.json({
    ok: true,
    reviewId: inserted.id,
    reviewedAt: inserted.reviewed_at,
    outcome,
    checklistVersion: version,
  });
}
