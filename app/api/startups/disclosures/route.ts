import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { resolveAdmin } from "@/lib/admin-guard";
import { maskIp } from "@/lib/identity";
import { isUuid } from "@/lib/utils";
import { CONFIDENTIALITY_MONTHS, NDA_VERSION } from "@/lib/nda-text";

/**
 * GET -- the founder's evidence view of their own confidentiality record.
 *
 * The day a founder believes somebody took their idea, the question is never
 * "did an investor have access". It is "who, under which words, and what
 * exactly did they open". nda_records answers the first two, nda_disclosures
 * the third, and introductions dates the relationship. This route is the only
 * way any of it reaches a browser: both tables have RLS enabled with no
 * permissive policy (migration 113), so every read is a deliberate act by a
 * caller proven to be party to the record.
 *
 * Two things are deliberately withheld. The investor's email address never
 * leaves the server -- a disclosure log is not a contact-scraping surface --
 * and IPs are masked, exactly as the NDA roster masks them: the full values
 * stay in the database for a dispute, where a court can ask for them.
 */

/** Everything a counterparty snapshot may carry into a response. A whitelist
 *  rather than a redaction list: the jsonb is written elsewhere and may gain
 *  fields, and an unknown field must default to withheld, not to leaked. */
const SNAPSHOT_FIELDS = [
  "name", "display_name", "firm_name", "firm", "title", "role",
  "type", "investor_type", "slug", "country", "trust_level", "verified_at",
] as const;

interface CounterpartySnapshot {
  name: string | null;
  firm: string | null;
  type: string | null;
  country: string | null;
  slug: string | null;
  trustLevel: number | null;
}

function scalar(v: unknown): string | number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const s = v.trim();
  // An address can arrive under any key -- a snapshot written as
  // { name: "a@b.com" } would otherwise walk straight through the whitelist.
  if (!s || s.includes("@")) return null;
  return s.slice(0, 200);
}

function readSnapshot(raw: unknown): CounterpartySnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const picked: Record<string, string | number> = {};
  for (const key of SNAPSHOT_FIELDS) {
    const v = scalar(src[key]);
    if (v !== null) picked[key] = v;
  }
  if (!Object.keys(picked).length) return null;
  const str = (k: string) => (typeof picked[k] === "string" ? (picked[k] as string) : null);
  const lvl = picked["trust_level"];
  return {
    name: str("name") ?? str("display_name") ?? null,
    firm: str("firm_name") ?? str("firm") ?? null,
    type: str("type") ?? str("investor_type") ?? null,
    country: str("country"),
    slug: str("slug"),
    trustLevel: typeof lvl === "number" ? Math.min(4, Math.max(0, Math.round(lvl))) : null,
  };
}

/** Clause 6 of the current wording. Taken from the constant the clause itself
 *  interpolates: a second copy of the number here would go on deriving expiry
 *  dates from the old term the day the wording changes. */
const NDA_TERM_MONTHS = CONFIDENTIALITY_MONTHS;

function plusMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const asked = req.nextUrl.searchParams.get("startupId");
  if (asked && !isUuid(asked)) {
    return NextResponse.json({ error: "Invalid startupId" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Ownership is read through owner_id on the listing itself rather than
  // through a role claim: this is the record of another party's contractual
  // obligations, and only the counterparty to it may see it.
  const { data: owned } = await admin
    .from("startups")
    .select("id, name")
    .eq("owner_id", user.id)
    // Same ordering as the founder dashboard, so the record shown here is the
    // record for the listing they were just looking at.
    .order("status", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let startup = owned;
  if (asked && owned?.id !== asked) {
    // An admin handling a dispute may read a named listing; nobody else may
    // name one at all, so a wrong id and a non-owner get the same answer.
    const who = await resolveAdmin("support");
    if (!who.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { data: target } = await admin
      .from("startups").select("id, name").eq("id", asked).maybeSingle();
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
    startup = target;
  }
  if (!startup) return NextResponse.json({ error: "Founders only" }, { status: 403 });

  const startupId = startup.id;

  const [{ data: ndas }, { data: intros }, { data: events }] = await Promise.all([
    admin.from("nda_records")
      .select("id, investor_id, signed_at, method, nda_version, text_sha256, counterparty, obligations_end_at")
      .eq("startup_id", startupId)
      .not("signed_at", "is", null)
      .order("signed_at", { ascending: false })
      .limit(500),
    admin.from("introductions")
      .select("investor_id, first_contact_at, channel, tail_ends_at, terms_version")
      .eq("startup_id", startupId)
      .limit(500),
    admin.from("nda_disclosures")
      .select("id, nda_record_id, investor_id, item_type, item_label, occurred_at, ip")
      .eq("startup_id", startupId)
      .order("occurred_at", { ascending: false })
      .limit(2000),
  ]);

  const records = ndas ?? [];
  const investorIds = Array.from(new Set(records.map((r) => r.investor_id)));

  // contact_email is never selected: the founder gets an identity, not a way
  // around the platform they are alleging somebody went around.
  const { data: investors } = investorIds.length
    ? await admin.from("investors")
        .select("id, slug, display_name, firm_name, type, trust_level, trust_expires_at")
        .in("id", investorIds)
    : { data: [] as Array<{ id: string; slug: string; display_name: string | null; firm_name: string | null; type: string; trust_level: number; trust_expires_at: string | null }> };

  const investorById = new Map((investors ?? []).map((i) => [i.id, i]));
  const introByInvestor = new Map((intros ?? []).map((i) => [i.investor_id, i]));

  interface DisclosureRow {
    id: string; ndaRecordId: string | null; itemType: string;
    itemLabel: string | null; occurredAt: string; ip: string;
  }
  const disclosuresByInvestor = new Map<string, DisclosureRow[]>();
  for (const e of events ?? []) {
    const list = disclosuresByInvestor.get(e.investor_id) ?? [];
    list.push({
      id: e.id,
      ndaRecordId: e.nda_record_id,
      itemType: e.item_type,
      itemLabel: e.item_label,
      occurredAt: e.occurred_at,
      ip: maskIp(e.ip),
    });
    disclosuresByInvestor.set(e.investor_id, list);
  }

  const now = Date.now();
  const counterparties = records.map((r) => {
    const inv = investorById.get(r.investor_id) ?? null;
    const snapshot = readSnapshot(r.counterparty);
    const intro = introByInvestor.get(r.investor_id) ?? null;

    // Recorded first, always. Deriving is only defensible for the wording we
    // can still read: for an older version, clause 6 is whatever that text
    // said, and guessing at it would be inventing evidence.
    let obligationsEndAt = r.obligations_end_at ?? null;
    let obligationsEndDerived = false;
    if (!obligationsEndAt && r.signed_at && r.nda_version === NDA_VERSION) {
      obligationsEndAt = plusMonths(r.signed_at, NDA_TERM_MONTHS);
      obligationsEndDerived = true;
    }

    // A disclosure logged before the signature is still the founder's to see,
    // but it did not happen under this agreement and the ledger must not imply
    // that it did. A row that names the record settles it outright; a row that
    // predates the linking column falls back to the timestamp.
    const signedMs = r.signed_at ? new Date(r.signed_at).getTime() : NaN;
    const rows = (disclosuresByInvestor.get(r.investor_id) ?? []).map((d) => ({
      ...d,
      underThisNda: d.ndaRecordId
        ? d.ndaRecordId === r.id
        : Number.isFinite(signedMs) && new Date(d.occurredAt).getTime() >= signedMs,
    }));

    return {
      ndaId: r.id,
      investor: inv
        ? { slug: inv.slug, name: inv.display_name || inv.firm_name || null, type: inv.type }
        : null,
      // Who they were at signing. Null on every signature written before
      // migration 113 -- the view says so rather than passing today's name
      // off as the one on the agreement.
      snapshot,
      trustLevelNow: inv ? inv.trust_level : null,
      trustExpiresAt: inv ? inv.trust_expires_at : null,
      signedAt: r.signed_at,
      method: r.method ?? "clickwrap",
      version: r.nda_version,
      textSha256: r.text_sha256,
      obligationsEndAt,
      obligationsEndDerived,
      obligationLive: obligationsEndAt ? new Date(obligationsEndAt).getTime() > now : null,
      introduction: intro
        ? {
            firstContactAt: intro.first_contact_at,
            channel: intro.channel,
            tailEndsAt: intro.tail_ends_at,
            tailLive: new Date(intro.tail_ends_at).getTime() > now,
            termsVersion: intro.terms_version,
          }
        : null,
      disclosures: rows,
    };
  });

  return NextResponse.json({
    startup: { id: startupId, name: startup.name },
    counterparties,
    // The cap is stated rather than hidden: a truncated log presented as a
    // complete one is the kind of thing that loses a case.
    truncated: (events ?? []).length >= 2000,
  });
}
