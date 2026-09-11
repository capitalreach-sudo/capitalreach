import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { requireAdmin, atLeast } from "@/lib/admin-guard";
import { dbRateLimit, RATE } from "@/lib/db-rate-limit";
import { contactRatelimit, isRedisConfigured } from "@/lib/redis";
import { notifyUsers } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";

/**
 * The incident path: a claim that a party on this platform is not what it says.
 *
 * Open to a visitor with no session, because the person who can say "those are
 * not their founders" is very often a competitor, an ex-employee or a
 * journalist with no account here. That is the whole reason `reports` exists
 * beside content_reports (083), which keys its one-open-report-per-person rule
 * on a reporter and therefore has to 401.
 *
 * Filing one does nothing. It does not move a listing, does not touch a deal,
 * does not mark a record. It puts a row on a bench for a person to read, and
 * the only thing that follows is whatever that person decides. The threat this
 * route has to hold off is the opposite of the usual one: not somebody
 * silencing a report, but somebody filing twenty of them to push a rival off
 * the marketplace, which is why the ceilings below are per subject as well as
 * per reporter.
 *
 * Nothing filed here is ever readable by the party it names. `reports` is RLS
 * on with no policy (126), so the queue exists only behind the GET below.
 */

const SUBJECTS = ["startup", "investor"] as const;
type SubjectType = (typeof SUBJECTS)[number];

function isSubjectType(v: unknown): v is SubjectType {
  return typeof v === "string" && (SUBJECTS as readonly string[]).includes(v);
}

/** `reason` is free text at the database (126) because a stranger is not
 *  picking from a menu the product has already imagined. A ceiling still
 *  applies: the queue renders it on one line. */
const REASON_MAX = 120;
const DETAIL_MAX = 2000;

/**
 * The brigading ceiling, counted on the SUBJECT rather than the reporter.
 *
 * A per-reporter limit does not touch the attack that matters, because filing
 * from six accounts or six browsers costs nothing. Six reports about one
 * company inside an hour is already more than a reviewer needs to open the
 * file; the seventh only buries the bench.
 */
const SUBJECT_WINDOW_MS = 3_600_000;
const SUBJECT_MAX_PER_WINDOW = 6;

const QUEUE_MAX = 200;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const subjectType = body?.subjectType;
  const subjectId = body?.subjectId;
  if (!isSubjectType(subjectType)) {
    return NextResponse.json({ error: "subjectType must be startup or investor" }, { status: 400 });
  }
  if (!isUuid(subjectId)) {
    return NextResponse.json({ error: "subjectId required" }, { status: 400 });
  }

  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, REASON_MAX) : "";
  if (!reason) return NextResponse.json({ error: "Say what is wrong." }, { status: 400 });

  const detail =
    typeof body?.detail === "string" && body.detail.trim()
      ? body.detail.trim().slice(0, DETAIL_MAX)
      : null;

  // A bare "other" is a row a reviewer cannot act on and cannot close.
  if (reason === "other" && !detail) {
    return NextResponse.json({ error: "Tell us what is wrong." }, { status: 400 });
  }

  // No 401 below this line: a session is read, not required.
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // types/supabase.ts is generated and does not name this table yet, so the
  // client is held at its un-parameterised type, the same shape admin-guard
  // hands to every admin route.
  const admin: SupabaseClient = createAdminClient();

  if (user) {
    const rl = await dbRateLimit(
      user.id,
      "report_party",
      ...(Object.values(RATE.perDay(10)) as [number, number]),
    );
    if (!rl.ok) {
      return NextResponse.json({ error: "You have filed a lot of reports today." }, { status: 429 });
    }
  } else if (isRedisConfigured) {
    // rate_events.user_id is a uuid with a foreign key to auth.users (103), so
    // the Postgres limiter cannot hold an address and there is nobody to key a
    // logged-out caller on but their IP. This degrades to a no-op where Upstash
    // is unconfigured, which is why the per-subject ceiling below is the one
    // that always holds.
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const { success } = await contactRatelimit.limit(`report:${ip}`).catch(() => ({ success: true }));
    if (!success) {
      return NextResponse.json({ error: "Too many reports. Try again later." }, { status: 429 });
    }
  }

  // subject_id carries no foreign key (it names one of two tables), so nothing
  // in the database stops a report about a uuid that is not a party here.
  const subjectTable = subjectType === "startup" ? "startups" : "investors";
  const { data: subject, error: subjectError } = await admin
    .from(subjectTable)
    .select("id")
    .eq("id", subjectId)
    .maybeSingle();

  if (subjectError) {
    console.error("[reports:subject]", subjectError);
    return NextResponse.json({ error: "Could not file the report" }, { status: 500 });
  }
  if (!subject) {
    return NextResponse.json({ error: "We could not find what you are reporting." }, { status: 404 });
  }

  const since = new Date(Date.now() - SUBJECT_WINDOW_MS).toISOString();
  const { count: recent, error: recentError } = await admin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .gte("created_at", since);

  // A limiter that cannot count must not be the thing that refuses a genuine
  // report, so a failed read is logged and passed, the rule lib/db-rate-limit
  // states for the same reason.
  if (recentError) {
    console.error("[reports:flood]", recentError);
  } else if ((recent ?? 0) >= SUBJECT_MAX_PER_WINDOW) {
    return NextResponse.json(
      { error: "This is already with us. Thank you." },
      { status: 429 },
    );
  }

  if (user) {
    const { data: mine, error: mineError } = await admin
      .from("reports")
      .select("id")
      .eq("subject_type", subjectType)
      .eq("subject_id", subjectId)
      .eq("reporter_id", user.id)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();

    if (mineError) {
      console.error("[reports:duplicate]", mineError);
    } else if (mine) {
      return NextResponse.json(
        { error: "You have already reported this. We are looking at it." },
        { status: 409 },
      );
    }
  }

  const { error: insertError } = await admin.from("reports").insert({
    subject_type: subjectType,
    subject_id: subjectId,
    reporter_id: user?.id ?? null,
    reason,
    detail,
  });

  if (insertError) {
    console.error("[reports:insert]", insertError);
    return NextResponse.json({ error: "Could not file the report" }, { status: 500 });
  }

  const { data: admins, error: adminsError } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(20);

  if (adminsError) console.error("[reports:admins]", adminsError);

  // The reason travels, the reporter's free text does not: a bell entry fanned
  // out to twenty accounts is the wrong place for somebody's unproven account
  // of a company. It is on the bench, in full, for whoever picks the file up.
  const adminIds = (admins ?? []).map((a: { id: string }) => a.id);
  if (adminIds.length) {
    await notifyUsers(adminIds, {
      type: "admin_alert",
      title: `A ${subjectType} was reported`,
      body: reason.replace(/_/g, " "),
      href: "/admin/reports",
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

/**
 * The bench, for the triage page.
 *
 * It lives on the collection rather than under /api/admin because
 * /api/admin/reports is the content_reports queue (083) and answers about a
 * different table; two queues sharing one path would leave an operator unable
 * to tell which bench they were looking at.
 *
 * Support level may read. Acting is operator, enforced by the route that acts.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const status = req.nextUrl.searchParams.get("status") ?? "open";

  let query = admin
    .from("reports")
    .select("id, subject_type, subject_id, reason, detail, status, handled_by, handled_at, created_at, reporter_id")
    .order("created_at", { ascending: false })
    .limit(QUEUE_MAX);
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("[reports:queue]", error);
    return NextResponse.json({ error: "Could not load the queue" }, { status: 500 });
  }

  type Row = {
    id: string;
    subject_type: string;
    subject_id: string;
    reason: string;
    detail: string | null;
    status: string;
    handled_by: string | null;
    handled_at: string | null;
    created_at: string;
    reporter_id: string | null;
  };

  const rows = (data ?? []) as Row[];
  const startupIds = rows.filter((r) => r.subject_type === "startup").map((r) => r.subject_id);
  const investorIds = rows.filter((r) => r.subject_type === "investor").map((r) => r.subject_id);
  const subjectIds = Array.from(new Set([...startupIds, ...investorIds]));
  const reporterIds = Array.from(new Set(rows.map((r) => r.reporter_id).filter((id): id is string => !!id)));

  const [startupRes, investorRes, reporterRes, siblingRes] = await Promise.all([
    startupIds.length
      ? admin.from("startups").select("id, name, slug, status").in("id", startupIds)
      : Promise.resolve({ data: [], error: null }),
    investorIds.length
      ? admin.from("investors").select("id, slug, display_name, firm_name, is_public").in("id", investorIds)
      : Promise.resolve({ data: [], error: null }),
    reporterIds.length
      ? admin.from("profiles").select("id, email, full_name").in("id", reporterIds)
      : Promise.resolve({ data: [], error: null }),
    // Every report against the subjects in view, whatever this filter is, so
    // the reviewer can see a pile-on as a pile-on rather than as one complaint.
    subjectIds.length
      ? admin.from("reports").select("subject_type, subject_id, status, reporter_id").in("subject_id", subjectIds).limit(1000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // A triage queue that cannot name who is being reported is worse than an
  // error message: the reviewer would act on a row identified only by a uuid.
  for (const [tag, res] of [
    ["startups", startupRes],
    ["investors", investorRes],
    ["reporters", reporterRes],
    ["siblings", siblingRes],
  ] as const) {
    if (res.error) {
      console.error(`[reports:queue:${tag}]`, res.error);
      return NextResponse.json({ error: "Could not load the queue" }, { status: 500 });
    }
  }

  const startups = (startupRes.data ?? []) as Array<{ id: string; name: string | null; slug: string | null; status: string | null }>;
  const investors = (investorRes.data ?? []) as Array<{ id: string; slug: string | null; display_name: string | null; firm_name: string | null; is_public: boolean | null }>;
  const reporters = (reporterRes.data ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>;
  const siblings = (siblingRes.data ?? []) as Array<{ subject_type: string; subject_id: string; status: string; reporter_id: string | null }>;

  return NextResponse.json({
    reports: rows.map((r) => {
      const s = r.subject_type === "startup" ? startups.find((x) => x.id === r.subject_id) : undefined;
      const i = r.subject_type === "investor" ? investors.find((x) => x.id === r.subject_id) : undefined;
      const mine = siblings.filter((x) => x.subject_type === r.subject_type && x.subject_id === r.subject_id);
      const reporter = r.reporter_id ? reporters.find((x) => x.id === r.reporter_id) : undefined;
      return {
        id: r.id,
        subjectType: r.subject_type,
        subjectId: r.subject_id,
        reason: r.reason,
        detail: r.detail,
        status: r.status,
        handledAt: r.handled_at,
        createdAt: r.created_at,
        subjectName: s?.name ?? i?.firm_name ?? i?.display_name ?? null,
        subjectHref: s?.slug ? `/startups/${s.slug}` : i?.slug ? `/investors/${i.slug}` : null,
        // Startups carry `status`, investors carry `is_public`; both are
        // normalised to the one thing the reviewer needs to know before acting.
        subjectLive: r.subject_type === "startup" ? s?.status === "active" : i?.is_public === true,
        subjectState: r.subject_type === "startup" ? s?.status ?? null : i?.is_public ? "public" : "not public",
        // Named for the reviewer alone. A pattern of reports from one account
        // against one rival is the signal this queue exists to make visible,
        // and it is invisible if every row says "reported".
        reporterLabel: r.reporter_id ? reporter?.full_name || reporter?.email || "member" : null,
        reportsOnSubject: mine.length,
        anonymousOnSubject: mine.filter((x) => !x.reporter_id).length,
        openOnSubject: mine.filter((x) => x.status === "open" || x.status === "investigating").length,
      };
    }),
    viewerLevel: guard.level,
    // The bench greys its own controls rather than letting a reviewer discover
    // the rule from a 403 after writing a suspension note.
    canAct: atLeast(guard.level, "operator"),
  });
}
