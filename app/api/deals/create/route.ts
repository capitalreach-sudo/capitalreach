import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isCurrencyCode, DEFAULT_CURRENCY } from "@/lib/currency";
import { isAccountSuspended } from "@/lib/suspension-guard";

// Creates a deal. Startups/investors pick a single counterpart and their own
// side is derived from their profile — never trusted from the request body.
// Admin isn't a participant on either side, so it explicitly names both.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A suspended account must not be able to write. The RESTRICTIVE policies in
  // 017 don't cover this route because the write goes through the service role.
  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }


  const { counterpartId, startupId, investorId, amount, currency } = await req.json();
  const dealCurrency = isCurrencyCode(currency) ? currency : DEFAULT_CURRENCY;
  const parsedAmount = typeof amount === "number" && amount > 0 ? Math.round(amount) : null;

  const admin = createAdminClient();

  let startup_id: string;
  let investor_id: string;

  if (startupId && investorId) {
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [{ data: st }, { data: inv }] = await Promise.all([
      admin.from("startups").select("id").eq("id", startupId).maybeSingle(),
      admin.from("investors").select("id").eq("id", investorId).maybeSingle(),
    ]);
    if (!st) return NextResponse.json({ error: "Startup not found" }, { status: 404 });
    if (!inv) return NextResponse.json({ error: "Investor not found" }, { status: 404 });
    startup_id  = st.id;
    investor_id = inv.id;
  } else if (counterpartId && typeof counterpartId === "string") {
    // Which side is the caller on?
    const [{ data: myStartup }, { data: myInvestor }] = await Promise.all([
      admin.from("startups").select("id").eq("owner_id", user.id).limit(1).maybeSingle(),
      admin.from("investors").select("id").eq("owner_id", user.id).limit(1).maybeSingle(),
    ]);

    if (myStartup) {
      const { data: inv } = await admin.from("investors").select("id").eq("id", counterpartId).maybeSingle();
      if (!inv) return NextResponse.json({ error: "Investor not found" }, { status: 404 });
      startup_id  = myStartup.id;
      investor_id = inv.id;
    } else if (myInvestor) {
      const { data: st } = await admin.from("startups").select("id, status").eq("id", counterpartId).maybeSingle();
      if (!st) return NextResponse.json({ error: "Startup not found" }, { status: 404 });
      // `status` was already being selected here but never tested, so an
      // investor holding a draft/suspended/rejected listing's id could open a
      // deal against a company that isn't listed. Only active ones are open
      // for business.
      if (st.status !== "active") {
        return NextResponse.json({ error: "That startup is not currently listed" }, { status: 409 });
      }
      startup_id  = st.id;
      investor_id = myInvestor.id;
    } else {
      return NextResponse.json({ error: "Complete onboarding first" }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "Missing counterpart" }, { status: 400 });
  }

  // One open deal per pair — closed/passed pairs may start a fresh one.
  const { data: existing } = await admin
    .from("deals")
    .select("id")
    .eq("startup_id", startup_id)
    .eq("investor_id", investor_id)
    .not("status", "in", "(closed,passed)")
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "An open deal with this partner already exists" }, { status: 409 });
  }

  const { data: deal, error } = await admin
    .from("deals")
    .insert({ startup_id, investor_id, amount: parsedAmount, currency: dealCurrency, status: "intro" })
    .select()
    .single();
  if (error || !deal) {
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }

  return NextResponse.json({ success: true, deal });
}
