import { NextRequest, NextResponse } from "next/server";
import { resolveTxt } from "node:dns/promises";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { dbRateLimit, RATE } from "@/lib/db-rate-limit";
import { isUuid } from "@/lib/utils";
import { DOMAIN_VERIFY_PREFIX, domainVerifyToken, normaliseDomain } from "@/lib/trust-signals";

// node:dns is unavailable on the edge runtime, and the check must reflect DNS
// as it is right now rather than as it was when the route was last cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Level 1 of the ladder, proven by the applicant without anyone's help.
 *
 * The case's token is published as a TXT record on the company domain; finding
 * it proves control of the domain, which is what "contactable" means. The
 * token itself is never in this response -- it is derived from the case id and
 * shown to the applicant through their own case, so this endpoint cannot be
 * turned into an oracle that hands out the record for a case somebody else
 * owns.
 *
 * POST { caseId, domain } -> { passed, domain, ... }
 */

/** A DNS lookup can hang far longer than a request should. */
const LOOKUP_TIMEOUT_MS = 4_000;

/** Statuses that can still take evidence. A decided case is closed. */
const OPEN_STATUSES = ["draft", "submitted", "in_review", "needs_more"];

/** Some DNS panels refuse a second TXT record on the apex, where SPF already
 *  lives, so the proof is accepted on this subdomain as well. */
const PROOF_SUBDOMAIN = "_capitalreach";

async function txtRecords(name: string): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("dns timeout")), LOOKUP_TIMEOUT_MS);
    });
    const chunks = await Promise.race([resolveTxt(name), timeout]);
    // A TXT answer arrives split into 255-character chunks; joining them is
    // what makes a long record comparable to the value we published.
    return chunks.map((parts) => parts.join("").trim());
  } finally {
    // Otherwise a pending timer holds the function open after the answer is in.
    if (timer) clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Cheap per lookup, not free: each call is two recursive DNS queries against
  // a name the caller chooses, which is a resolver amplifier if left open.
  const limit = await dbRateLimit(user.id, "verification_domain_check", ...Object.values(RATE.perHour(20)) as [number, number]);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many domain checks", messageKey: "verify.domain.tooMany" },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const caseId = body?.caseId;
  if (!isUuid(caseId)) return NextResponse.json({ error: "caseId required" }, { status: 400 });

  const domain = normaliseDomain(body?.domain);
  if (!domain) {
    return NextResponse.json(
      { error: "Enter a domain such as example.com", messageKey: "verify.domain.invalidDomain" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  // Never risk_score or risk_flags: they are revoked from client keys and must
  // not reach an applicant through a route either.
  const { data: vcase } = await admin
    .from("verification_cases")
    .select("id, owner_id, subject_type, subject_id, status")
    .eq("id", caseId)
    .maybeSingle();
  if (!vcase) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (vcase.owner_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Owning the case is not enough: the case names a subject, and only that
  // subject's owner may add evidence to it. A listing that changed hands since
  // the case opened must not keep proving domains for its previous owner.
  const subject = vcase.subject_type === "startup"
    ? await admin.from("startups").select("owner_id").eq("id", vcase.subject_id).maybeSingle()
    : await admin.from("investors").select("owner_id").eq("id", vcase.subject_id).maybeSingle();
  if (!subject.data || subject.data.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!OPEN_STATUSES.includes(vcase.status)) {
    return NextResponse.json(
      { error: "This application is closed", messageKey: "verify.domain.caseClosed" },
      { status: 409 },
    );
  }

  const names = [domain, `${PROOF_SUBDOMAIN}.${domain}`];
  const expected = `${DOMAIN_VERIFY_PREFIX}=${domainVerifyToken(vcase.id)}`.toLowerCase();

  // Both names at once: two sequential timeouts would be most of a serverless
  // function's whole budget for a request that is otherwise a few queries.
  const results = await Promise.allSettled(names.map((name) => txtRecords(name)));

  let seen = 0;
  let matchedName: string | null = null;
  let lookupFailed = 0;
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status !== "fulfilled") {
      // ENOTFOUND on the _capitalreach name is the normal case when the proof
      // sits on the apex, so a failed lookup is only conclusive if both fail.
      lookupFailed++;
      continue;
    }
    seen += result.value.length;
    if (!matchedName && result.value.some((r) => r.toLowerCase() === expected)) matchedName = names[i];
  }

  const passed = !!matchedName;
  const reason = passed ? null : lookupFailed === names.length ? "dns_error" : seen === 0 ? "no_records" : "no_match";

  const detail = {
    domain,
    checked_names: names,
    records_seen: seen,
    // Who proved it, so the sweep can tell later that the listing changed
    // hands since the proof, and so the record is auditable on its own.
    owner_id: user.id,
    ...(matchedName ? { matched_name: matchedName } : { reason }),
  };

  // One row per case and domain: re-running the check after fixing the record
  // updates the attempt rather than stacking a pile of failures a reviewer has
  // to read through.
  const { data: priorAttempts } = await admin
    .from("verification_evidence")
    .select("id, detail")
    .eq("case_id", vcase.id)
    .eq("kind", "domain_control")
    .limit(20);
  const existing = (priorAttempts ?? []).find(
    (e) => (e.detail as { domain?: string } | null)?.domain === domain,
  );

  const row = {
    case_id: vcase.id,
    kind: "domain_control",
    method: "dns_txt",
    status: passed ? "passed" : "failed",
    detail,
    checked_at: new Date().toISOString(),
  };

  if (existing) {
    await admin.from("verification_evidence").update(row).eq("id", existing.id);
  } else {
    await admin.from("verification_evidence").insert(row);
  }

  // A failed attempt raises no trust signal on purpose. Propagation takes up
  // to an hour, so the first check after publishing a record usually fails for
  // an honest applicant -- flagging that would be scoring impatience as fraud.
  // The failed evidence row is there for a reviewer who wants the history.

  return NextResponse.json({
    ok: true,
    passed,
    domain,
    recordsSeen: seen,
    ...(passed
      ? { messageKey: "verify.domain.passed" }
      : {
          reason,
          messageKey:
            reason === "dns_error" ? "verify.domain.dnsError"
            : reason === "no_records" ? "verify.domain.noRecords"
            : "verify.domain.noMatch",
        }),
  });
}
