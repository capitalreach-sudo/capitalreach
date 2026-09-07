import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { notifyUser, notifyUsers } from "@/lib/notify-user";
import { logSystemEvent } from "@/lib/system-events";
import { isExpired, REVERIFY_TRIGGERS, type ReverifyTrigger, type SubjectType } from "@/lib/trust";
import { normaliseCompanyName, normaliseCompanyNumber, normaliseDomain, recordSignal } from "@/lib/trust-signals";

export const dynamic = "force-dynamic";

/**
 * The sweep that keeps a badge honest between reviews.
 *
 * A verification is a photograph of a company on one day. Companies change
 * hands, directors resign, and an account gets phished -- so a badge granted
 * twelve months ago is a claim about the past being displayed as a claim about
 * the present. This pass does the two things nobody is ever going to remember
 * to do by hand:
 *
 *   (a) expires standing verifications past trust_expires_at, so an expired
 *       check reads as unverified rather than as verified-forever;
 *   (b) raises a re-verify signal when a verified subject's legal name,
 *       company number, owner, domain or country stops matching the evidence
 *       the approval stands on.
 *
 * It decides nothing beyond (a), which is arithmetic on a date the reviewer
 * set. Drift raises a flag for the queue; a human re-opens the case.
 */

/** Subjects per round trip. Small enough that every `in` filter stays a short
 *  query string, large enough that the sweep is a handful of queries. */
const BATCH = 100;

interface Standing {
  subjectType: SubjectType;
  id: string;
  ownerId: string | null;
  name: string;
  country: string | null;
  domain: string | null;
  trustLevel: number;
  expiresAt: string | null;
}

/** What the approval actually recorded, merged from the case's evidence. */
interface Snapshot {
  legal_name?: string;
  company_number?: string;
  owner_id?: string;
  domain?: string;
  country?: string;
}

/** Lanes record their evidence detail with the names their vendor uses, so the
 *  snapshot reads a few spellings of each fact rather than one. */
const SNAPSHOT_KEYS: Record<keyof Snapshot, string[]> = {
  legal_name:     ["legal_name", "company_name", "registered_name", "name"],
  company_number: ["company_number", "registration_number", "registry_number", "company_no"],
  owner_id:       ["owner_id"],
  domain:         ["domain", "website_domain", "website"],
  country:        ["country", "country_code", "jurisdiction"],
};

function readSnapshot(details: Array<Record<string, unknown> | null>): Snapshot {
  const snap: Snapshot = {};
  for (const detail of details) {
    if (!detail) continue;
    for (const field of Object.keys(SNAPSHOT_KEYS) as Array<keyof Snapshot>) {
      if (snap[field]) continue;
      for (const key of SNAPSHOT_KEYS[field]) {
        const value = detail[key];
        if (typeof value === "string" && value.trim()) {
          snap[field] = value.trim();
          break;
        }
      }
    }
  }
  return snap;
}

/**
 * A register holds "Acme Technologies Ltd" where the listing says "Acme". That
 * is one company described twice, not a rename, and flagging it every night
 * would train the reviewer to ignore the signal that matters. Only a name that
 * is neither the other nor an extension of it counts as a change.
 */
function sameCompany(a: string, b: string): boolean {
  const x = normaliseCompanyName(a);
  const y = normaliseCompanyName(b);
  if (!x || !y) return true;
  return x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `);
}

/** Proof on acme.com covers app.acme.com: control of the parent is control of
 *  the child. A different registrable name is a different company's domain. */
function sameDomain(a: string, b: string): boolean {
  const x = normaliseDomain(a);
  const y = normaliseDomain(b);
  if (!x || !y) return true;
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

/**
 * Which facts moved since the approval.
 *
 * Blank sides never count: evidence that never recorded a company number
 * cannot disagree about one, and an empty website is a founder who removed a
 * link, not a company that moved domain. Silence is not a change.
 */
function drift(approved: Snapshot, current: Snapshot): ReverifyTrigger[] {
  const out: ReverifyTrigger[] = [];
  const both = (field: keyof Snapshot) => !!approved[field] && !!current[field];

  if (both("legal_name") && !sameCompany(approved.legal_name!, current.legal_name!)) {
    out.push("legal_name_changed");
  }
  if (both("company_number") && normaliseCompanyNumber(approved.company_number!) !== normaliseCompanyNumber(current.company_number!)) {
    out.push("company_number_changed");
  }
  if (both("owner_id") && approved.owner_id !== current.owner_id) out.push("owner_changed");
  if (both("domain") && !sameDomain(approved.domain!, current.domain!)) out.push("domain_changed");
  if (both("country") && approved.country!.toUpperCase() !== current.country!.toUpperCase()) out.push("country_changed");
  return out;
}

/** What the subject looks like today. The live row wins over any evidence for
 *  the facts it holds; a company number exists only in evidence, so it comes
 *  from whatever was recorded after the approval. */
function currentFacts(subject: Standing, laterEvidence: Array<Record<string, unknown> | null>): Snapshot {
  const fromEvidence = readSnapshot(laterEvidence);
  return {
    ...fromEvidence,
    ...(subject.name ? { legal_name: subject.name } : {}),
    ...(subject.ownerId ? { owner_id: subject.ownerId } : {}),
    ...(subject.domain ? { domain: subject.domain } : {}),
    ...(subject.country ? { country: subject.country } : {}),
  };
}

export async function GET(req: NextRequest) {
  // Same contract as the other crons: without a configured secret this stays
  // shut rather than defaulting open. It can clear the badge on every account.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/trust-sweep] CRON_SECRET is not set -- refusing to run.");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const [startups, investors] = await Promise.all([
    admin.from("startups")
      .select("id, name, owner_id, country, website, trust_level, trust_expires_at")
      .gt("trust_level", 0).limit(1000),
    admin.from("investors")
      .select("id, display_name, firm_name, owner_id, website, trust_level, trust_expires_at")
      .gt("trust_level", 0).limit(1000),
  ]);

  if (startups.error || investors.error) {
    const message = startups.error?.message ?? investors.error?.message ?? "unknown";
    await logSystemEvent("cron/trust-sweep", "error", "Standing-verification query failed", { error: message });
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const standing: Standing[] = [
    ...(startups.data ?? []).map((s) => ({
      subjectType: "startup" as const,
      id: s.id,
      ownerId: s.owner_id,
      name: s.name,
      country: s.country,
      domain: normaliseDomain(s.website),
      trustLevel: s.trust_level,
      expiresAt: s.trust_expires_at,
    })),
    ...(investors.data ?? []).map((i) => ({
      subjectType: "investor" as const,
      id: i.id,
      ownerId: i.owner_id,
      // An investor has no country column, so country drift is a startup-only
      // comparison; firm name first, since that is what a register would hold.
      name: i.firm_name ?? i.display_name ?? "",
      country: null,
      domain: normaliseDomain(i.website),
      trustLevel: i.trust_level,
      expiresAt: i.trust_expires_at,
    })),
  ];

  // ── (a) Expiry ────────────────────────────────────────────────────────────
  let expired = 0;
  const live: Standing[] = [];
  for (const subject of standing) {
    if (!isExpired(subject.expiresAt)) {
      live.push(subject);
      continue;
    }

    // trust_reviewed_at and trust_expires_at are left alone: they are the
    // record of what lapsed and when, which the next case starts from.
    const update = subject.subjectType === "startup"
      ? await admin.from("startups").update({ trust_level: 0 }).eq("id", subject.id)
      : await admin.from("investors").update({ trust_level: 0 }).eq("id", subject.id);
    if (update.error) continue;
    expired++;

    // The case says approved and the badge says nothing: the two must agree,
    // or the admin queue shows a verification that no longer exists.
    await admin.from("verification_cases")
      .update({ status: "expired" })
      .eq("subject_type", subject.subjectType)
      .eq("subject_id", subject.id)
      .eq("status", "approved")
      .then(undefined, () => {});

    await recordSignal(subject.subjectType, subject.id, "expired", "low", {
      was_level: subject.trustLevel,
      expired_at: subject.expiresAt,
      swept_at: nowIso,
    });

    if (subject.ownerId) {
      await notifyUser({
        userId: subject.ownerId,
        // 111 added no notification type, and "verified" is the channel this
        // platform already uses for a change in standing.
        type: "verified",
        title: `Verification for ${subject.name || "your account"} has expired`,
        body: "Twelve months have passed since it was granted. Re-verify to put the badge back.",
        titleKey: "notif.trustExpiredTitle",
        bodyKey: "notif.trustExpiredBody",
        params: { name: subject.name || "your account" },
        href: "/dashboard",
      });
    }
  }

  // ── (b) Drift against the evidence the approval stands on ─────────────────
  // In batches: every filter below travels in the query string, and a single
  // `in` list of a thousand uuids is a URL no gateway will accept.
  let reverifySignals = 0;
  for (let i = 0; i < live.length; i += BATCH) {
    const batch = live.slice(i, i + BATCH);
    const subjectIds = batch.map((s) => s.id);

    const { data: cases } = await admin
      .from("verification_cases")
      .select("id, subject_type, subject_id, status, reviewed_at, created_at")
      .in("subject_id", subjectIds)
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .limit(1000);

    // Newest approval per subject wins: an older case describes an older
    // company, and comparing against it would flag a change already reviewed.
    const latest = new Map<string, { id: string; at: string }>();
    for (const c of cases ?? []) {
      if (c.status !== "approved") continue;
      const key = `${c.subject_type}:${c.subject_id}`;
      if (!latest.has(key)) latest.set(key, { id: c.id, at: c.reviewed_at ?? c.created_at });
    }
    const caseSubject = new Map((cases ?? []).map((c) => [c.id, `${c.subject_type}:${c.subject_id}`]));

    // Every passed piece of evidence on these subjects, whichever case it
    // belongs to: the approval snapshot comes from the approved case, and
    // anything newer is what the subject claims about itself today.
    const evidenceByCase = new Map<string, Array<{ detail: Record<string, unknown> | null; at: string }>>();
    const allCaseIds = (cases ?? []).map((c) => c.id);
    if (allCaseIds.length) {
      const { data: evidence } = await admin
        .from("verification_evidence")
        .select("case_id, kind, detail, status, created_at, checked_at")
        .in("case_id", allCaseIds)
        // Only what actually passed describes a verified fact.
        .eq("status", "passed")
        .limit(2000);
      for (const e of evidence ?? []) {
        const list = evidenceByCase.get(e.case_id) ?? [];
        list.push({ detail: e.detail as Record<string, unknown> | null, at: e.checked_at ?? e.created_at });
        evidenceByCase.set(e.case_id, list);
      }
    }

    // Already-standing triggers, so a company that renamed itself in March is
    // not reported again every night until somebody resolves the signal.
    const { data: openSignals } = await admin
      .from("trust_signals")
      .select("subject_type, subject_id, signal")
      .is("resolved_at", null)
      .in("subject_id", subjectIds)
      .limit(1000);
    const standingSignals = new Set(
      (openSignals ?? []).map((s) => `${s.subject_type}:${s.subject_id}:${s.signal}`),
    );

    for (const subject of batch) {
      const key = `${subject.subjectType}:${subject.id}`;
      const approval = latest.get(key);
      if (!approval) continue;

      const approved = readSnapshot((evidenceByCase.get(approval.id) ?? []).map((e) => e.detail));
      // Evidence on this subject's other cases, recorded after the approval,
      // newest first -- the only place a fact like a company number can have
      // moved without a column to hold it.
      const later = (cases ?? [])
        .filter((c) => caseSubject.get(c.id) === key && c.id !== approval.id)
        .flatMap((c) => evidenceByCase.get(c.id) ?? [])
        .filter((e) => e.at > approval.at)
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .map((e) => e.detail);
      const current = currentFacts(subject, later);

      for (const trigger of drift(approved, current)) {
        if (!(REVERIFY_TRIGGERS as readonly string[]).includes(trigger)) continue;
        if (standingSignals.has(`${subject.subjectType}:${subject.id}:${trigger}`)) continue;
        await recordSignal(subject.subjectType, subject.id, trigger, "medium", {
          case_id: approval.id,
          was: approved,
          now: current,
        });
        standingSignals.add(`${subject.subjectType}:${subject.id}:${trigger}`);
        reverifySignals++;
      }
    }
  }

  // One bell per run, not one per subject: a rename spree is a single thing to
  // look at, and a queue nobody can face is a queue nobody reads.
  if (reverifySignals > 0) {
    const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin").limit(20);
    await notifyUsers((admins ?? []).map((a) => a.id), {
      type: "admin_alert",
      title: reverifySignals === 1
        ? "A verified account changed key details"
        : `${reverifySignals} verified accounts changed key details`,
      body: "A verified name, owner, domain or country no longer matches the evidence it was approved on. Open the trust queue to review.",
      titleKey: "notif.reverifyTitle",
      bodyKey: "notif.reverifyBody",
      params: { count: reverifySignals },
      href: "/admin",
    });
  }

  const summary = {
    checked: standing.length,
    expired,
    reverifySignals,
    stillValid: live.length,
  };
  await logSystemEvent("cron/trust-sweep", "info", "Run completed", summary);

  return NextResponse.json({ ok: true, ...summary });
}
