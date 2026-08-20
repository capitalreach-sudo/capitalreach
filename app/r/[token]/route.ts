import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

/**
 * A share link: /r/<token> → the listing, with the open recorded.
 *
 * A route handler rather than a page, because the only thing this URL does is
 * count the open and forward. Keeping the listing at one canonical address
 * matters more than a prettier share URL: two pages showing the same round
 * would drift, and one of them would be the one search engines indexed.
 *
 * Every failure mode lands on the same place — the browse page — rather than a
 * 404 that tells whoever holds a dead link that they were once meant to have
 * something. Expired, revoked and never-existed are indistinguishable from
 * outside, which is what stops the token space being probed.
 */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const token = (params.token ?? "").toLowerCase().slice(0, 64);
  const home = new URL("/startups", req.url);
  if (!/^[a-z0-9]{8,64}$/.test(token)) return NextResponse.redirect(home);

  const admin = createAdminClient();
  const { data: link } = await admin
    .from("round_shares")
    .select("id, token, opens, grants_documents, expires_at, revoked_at, startup:startups(slug, status)")
    .eq("token", token)
    .maybeSingle();

  const startup = link?.startup as unknown as { slug: string; status: string } | null;
  const dead =
    !link ||
    !!link.revoked_at ||
    (link.expires_at && new Date(link.expires_at) < new Date()) ||
    startup?.status !== "active";

  if (dead || !startup) return NextResponse.redirect(home);

  // Counted before the redirect and awaited: on Vercel the lambda freezes the
  // moment the response goes out, so a detached update never runs.
  await admin
    .from("round_shares")
    .update({ opens: (link.opens ?? 0) + 1, last_opened_at: new Date().toISOString() })
    .eq("id", link.id);

  const target = new URL(`/startups/${startup.slug}`, req.url);
  // The listing reads this to decide whether to offer the deck to a visitor
  // with no account. The token, not a boolean — the page re-checks it rather
  // than trusting a query parameter that anyone could append.
  if (link.grants_documents) target.searchParams.set("share", token);

  return NextResponse.redirect(target);
}
