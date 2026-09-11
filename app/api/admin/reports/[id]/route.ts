import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-guard";
import { notifyUser, notifyUsers } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";

/**
 * What a person decides about one incident report.
 *
 * The parent route on this path answers about content_reports (083). This one
 * answers about `reports` (126), the party-level claim, and the three things
 * an operator may do with one.
 *
 * NOTHING REACHES THIS ROUTE ON A TIMER, A SWEEP OR A THRESHOLD. A report does
 * not suspend anything by existing, by being filed six times, or by naming
 * something serious. If that were not true, an investor could take a rival
 * listing off the marketplace for the price of six anonymous form
 * submissions, and the marketplace would be theirs to edit. Every state below
 * is written with the name of the admin who chose it, which is also the
 * database's rule: reports_terminal_status_needs_a_human (126) refuses a
 * terminal status with no handler on it.
 *
 * Suspension here is of the LISTING, not of the account. Locking somebody out
 * of their own data, revoking their sessions and emailing them about it is a
 * heavier and differently-evidenced decision that belongs to
 * /api/admin/suspend, taken by a person who has read the whole file. Taking a
 * listing off the market while a claim is looked at is the proportionate one.
 *
 * And the counterparty on an open deal is told that the listing is under
 * review. Not the claim, not the reason, not the reporter. Passing an unproven
 * allegation about a company to the investor sitting across a live deal from
 * them is its own liability, and it is one the reporter did not ask us to take
 * and the subject has had no chance to answer.
 */

const ACTIONS = ["suspend", "request_evidence", "dismiss"] as const;
type Action = (typeof ACTIONS)[number];

function isAction(v: unknown): v is Action {
  return typeof v === "string" && (ACTIONS as readonly string[]).includes(v);
}

const NOTE_MAX = 1000;

/** A deal nobody has finished with. `closed` and `passed` are terminal, so a
 *  listing coming down changes nothing either side of them can still act on. */
const OPEN_DEAL_STATUSES = ["intro", "due_diligence", "term_sheet"];

type SubjectRow = {
  id: string;
  ownerId: string | null;
  name: string;
  live: boolean;
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const reportId = params.id;
  if (!isUuid(reportId)) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (!isAction(action)) {
    return NextResponse.json(
      { error: "action must be suspend, request_evidence or dismiss" },
      { status: 400 },
    );
  }

  const note = typeof body?.note === "string" ? body.note.trim().slice(0, NOTE_MAX) : "";

  // A listing taken off the market with no recorded ground is indefensible the
  // moment anybody asks, and an evidence request with no ask in it tells the
  // member only that they are under suspicion.
  if (action === "suspend" && !note) {
    return NextResponse.json({ error: "Say why the listing is coming down." }, { status: 400 });
  }
  if (action === "request_evidence" && !note) {
    return NextResponse.json({ error: "Say what you are asking them for." }, { status: 400 });
  }

  const { data: report, error: reportError } = await admin
    .from("reports")
    .select("id, subject_type, subject_id, reason, status, reporter_id")
    .eq("id", reportId)
    .maybeSingle();

  // "Not found" is a fact about the bench. A failed read must not borrow it:
  // an operator acts on that answer by going looking somewhere else.
  if (reportError) {
    console.error("[admin/reports:read]", reportError);
    return NextResponse.json({ error: "Could not read the report" }, { status: 500 });
  }
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (report.status === "actioned" || report.status === "dismissed") {
    return NextResponse.json({ error: "This report is already closed." }, { status: 409 });
  }

  const subjectType = report.subject_type as "startup" | "investor";

  let subject: SubjectRow | null = null;
  if (subjectType === "startup") {
    const { data, error } = await admin
      .from("startups")
      .select("id, name, owner_id, status")
      .eq("id", report.subject_id)
      .maybeSingle();
    if (error) {
      console.error("[admin/reports:startup]", error);
      return NextResponse.json({ error: "Could not read the listing" }, { status: 500 });
    }
    if (data) {
      subject = { id: data.id, ownerId: data.owner_id, name: data.name ?? "listing", live: data.status === "active" };
    }
  } else {
    const { data, error } = await admin
      .from("investors")
      .select("id, display_name, firm_name, owner_id, is_public")
      .eq("id", report.subject_id)
      .maybeSingle();
    if (error) {
      console.error("[admin/reports:investor]", error);
      return NextResponse.json({ error: "Could not read the profile" }, { status: 500 });
    }
    if (data) {
      subject = {
        id: data.id,
        ownerId: data.owner_id,
        name: data.firm_name || data.display_name || "profile",
        live: data.is_public === true,
      };
    }
  }

  // A report can outlive what it names. Closing it is still the right move;
  // suspending something that is not there is not.
  if (!subject && action === "suspend") {
    return NextResponse.json(
      { error: "That listing no longer exists, so there is nothing to take down. Dismiss it instead." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();

  // ── Suspension ──────────────────────────────────────────────────────────
  // The listing comes down BEFORE the report is marked, so that a write
  // failing anywhere below leaves the report still open and this whole route
  // safe to run again. The reverse order would leave a terminal report over a
  // listing that is still live, and the 409 above would then refuse the retry.
  let counterpartiesTold = 0;
  if (action === "suspend" && subject) {
    if (subjectType === "startup") {
      // Only an active listing flips, which is the rule /api/admin/suspend
      // follows and /api/admin/unsuspend relies on to restore exactly the rows
      // it took: a draft turned 'suspended' here would come back 'active'.
      const { error } = await admin
        .from("startups")
        .update({ status: "suspended" })
        .eq("id", subject.id)
        .eq("status", "active");
      if (error) {
        console.error("[admin/reports:suspend-startup]", error);
        return NextResponse.json({ error: "Could not take the listing down" }, { status: 500 });
      }
    } else {
      const { error } = await admin
        .from("investors")
        .update({ is_public: false })
        .eq("id", subject.id)
        .eq("is_public", true);
      if (error) {
        console.error("[admin/reports:suspend-investor]", error);
        return NextResponse.json({ error: "Could not take the profile down" }, { status: 500 });
      }
    }

    await logAdminAction(
      admin,
      guard.adminId,
      "report_suspend_listing",
      subjectType === "startup" ? "startup" : "investor",
      subject.id,
      {
        reportId,
        reason: report.reason,
        note,
        // is_public has no restore path of its own, so the value taken away is
        // written down where it can be read back.
        previous_live: subject.live,
        handled_at: now,
      },
    );
  }

  // ── The record ──────────────────────────────────────────────────────────
  const nextStatus =
    action === "suspend" ? "actioned" : action === "dismiss" ? "dismissed" : "investigating";

  const { error: updateError } = await admin
    .from("reports")
    .update({ status: nextStatus, handled_by: guard.adminId, handled_at: now })
    .eq("id", reportId);

  if (updateError) {
    console.error("[admin/reports:write]", updateError);
    return NextResponse.json(
      {
        error:
          action === "suspend"
            ? "The listing is down but the report did not save. Run it again."
            : "Could not update the report",
      },
      { status: 500 },
    );
  }

  await logAdminAction(admin, guard.adminId, `report_${action}`, "platform", reportId, {
    subject_type: subjectType,
    subject_id: report.subject_id,
    status: nextStatus,
    reason: report.reason,
    note: note || null,
    handled_at: now,
  });

  // ── Who is told what ────────────────────────────────────────────────────
  if (action === "request_evidence" && subject?.ownerId) {
    // The subject is the one party entitled to know what they are being asked
    // to answer, which is why the operator's words travel here and nowhere
    // else. The reporter is never named in it.
    await notifyUser({
      userId: subject.ownerId,
      type: "admin_alert",
      title: "We need something from you",
      body: note,
      href: "/dashboard",
    });
  }

  if (action === "suspend" && subject) {
    if (subject.ownerId) {
      await notifyUser({
        userId: subject.ownerId,
        type: "admin_alert",
        title: "Your listing is under review",
        body: note,
        href: "/dashboard",
      });
    }

    // Everyone mid-deal with the subject learns the listing is under review,
    // and learns nothing else. No reason, no claim, no reporter: repeating an
    // unproven allegation to the party across a live deal is a liability of
    // our own making, and they can draw their own conclusion from the fact
    // that the listing has gone.
    const dealColumn = subjectType === "startup" ? "startup_id" : "investor_id";
    const { data: openDeals, error: dealsError } = await admin
      .from("deals")
      .select("id, startup:startups(owner_id), investor:investors(owner_id)")
      .eq(dealColumn, subject.id)
      .in("status", OPEN_DEAL_STATUSES)
      .limit(200);

    if (dealsError) {
      console.error("[admin/reports:deals]", dealsError);
    } else {
      const counterpartyIds = (openDeals ?? []).map((d) => {
        const startup = d.startup as unknown as { owner_id: string | null } | null;
        const investor = d.investor as unknown as { owner_id: string | null } | null;
        return subjectType === "startup" ? investor?.owner_id ?? null : startup?.owner_id ?? null;
      });
      counterpartiesTold = new Set(counterpartyIds.filter(Boolean)).size;
      if (counterpartiesTold) {
        await notifyUsers(counterpartyIds, {
          type: "admin_alert",
          title: "A listing on one of your deals is under review",
          body: "We will tell you when the review closes.",
          href: "/deals",
        }).catch(() => {});
      }
    }
  }

  // A report that vanishes teaches people not to file the next one, so the
  // reporter hears back wherever there is somebody to hear it. What was done
  // is not described: the outcome belongs to the subject, not to whoever
  // pointed at them.
  if (report.reporter_id && (action === "suspend" || action === "dismiss")) {
    await notifyUser({
      userId: report.reporter_id,
      type: "admin_alert",
      title: "We looked at your report",
      body: "Thank you for telling us. The review is closed.",
      href: "/dashboard",
    });
  }

  return NextResponse.json({ ok: true, status: nextStatus, counterpartiesTold });
}
