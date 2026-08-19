import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

/**
 * E54: the admin tables past the first fifty rows.
 *
 * /admin loaded a hardcoded 50 startups, 50 investors and 50 deals with no
 * search, no paging and no indication that anything had been cut off. At 100+
 * accounts the operator was looking at an arbitrary slice of the platform and
 * had no way to know it.
 *
 * GET ?entity=startups|investors|deals&q=&status=&page=&pageSize=&format=csv
 */

const PAGE_MAX = 100;
const CSV_MAX = 5000;

type Entity = "startups" | "investors" | "deals";

// PostgREST `or` is a mini-language; a comma or paren in the query would
// change its meaning rather than just its terms.
const clean = (q: string) => q.replace(/[,()*\\%]/g, " ").trim().slice(0, 80);

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map(r => cols.map(c => cell(r[c])).join(","))].join("\n");
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const sp = req.nextUrl.searchParams;
  const entity = (["startups", "investors", "deals"].includes(sp.get("entity") ?? "") ? sp.get("entity") : "startups") as Entity;
  const q = clean(sp.get("q") ?? "");
  const status = clean(sp.get("status") ?? "");
  const csv = sp.get("format") === "csv";
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = csv ? CSV_MAX : Math.min(PAGE_MAX, Math.max(5, parseInt(sp.get("pageSize") ?? "25", 10) || 25));
  const from = csv ? 0 : (page - 1) * pageSize;

  let query;
  if (entity === "startups") {
    query = admin.from("startups")
      .select("id, name, slug, status, industry, stage, subscription_tier, funding_target, verified_at, edited_since_review_at, created_at, owner:profiles(email, full_name)", { count: "exact" })
      .order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%,industry.ilike.%${q}%`);
  } else if (entity === "investors") {
    query = admin.from("investors")
      .select("id, slug, type, display_name, firm_name, subscription_tier, verified_at, is_public, is_external, created_at, owner:profiles(email, full_name, subscription_tier)", { count: "exact" })
      .order("created_at", { ascending: false });
    if (status === "external") query = query.eq("is_external", true);
    else if (status === "public") query = query.eq("is_public", true).eq("is_external", false);
    if (q) query = query.or(`display_name.ilike.%${q}%,firm_name.ilike.%${q}%,slug.ilike.%${q}%`);
  } else {
    query = admin.from("deals")
      .select("id, status, amount, currency, commitment_type, closed_at, funded_at, success_fee_amount, success_fee_invoiced, success_fee_paid_at, fee_billing_status, updated_at, startup:startups(name, slug), investor:investors(slug, display_name)", { count: "exact" })
      .order("updated_at", { ascending: false });
    if (status) query = query.eq("status", status);
  }

  const { data, count, error } = await query.range(from, from + pageSize - 1);
  if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });

  // A deal search matches on the startup's name, which is on the embed rather
  // than the row — filtering it in SQL would need a view. Filtering here is
  // honest as long as the caller can see it only narrowed the current page,
  // which is why deals search is applied AFTER paging and the count is not
  // adjusted; the UI labels it accordingly.
  let rows = (data ?? []) as unknown as Record<string, unknown>[];
  if (entity === "deals" && q) {
    const needle = q.toLowerCase();
    rows = rows.filter(r => {
      const s = r.startup as { name?: string } | null;
      const i = r.investor as { display_name?: string; slug?: string } | null;
      return `${s?.name ?? ""} ${i?.display_name ?? ""} ${i?.slug ?? ""}`.toLowerCase().includes(needle);
    });
  }

  if (csv) {
    const flat = rows.map(r => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) out[`${k}_${k2}`] = v2;
        } else out[k] = v;
      }
      return out;
    });
    return new NextResponse(toCsv(flat), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${entity}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json({ rows, total: count ?? 0, page, pageSize, truncated: (count ?? 0) > CSV_MAX });
}
