import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isCurrencyCode, DEFAULT_CURRENCY } from "@/lib/currency";

// Creates a deal between the caller's startup/investor profile and a chosen
// counterpart. The caller's own side is derived from their profile — never
// trusted from the request body.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { counterpartId, amount, currency } = await req.json();
  if (!counterpartId || typeof counterpartId !== "string") {
    return NextResponse.json({ error: "Missing counterpart" }, { status: 400 });
  }
  const dealCurrency = isCurrencyCode(currency) ? currency : DEFAULT_CURRENCY;
  const parsedAmount = typeof amount === "number" && amount > 0 ? Math.round(amount) : null;

  const admin = createAdminClient();

  // Which side is the caller on?
  const [{ data: myStartup }, { data: myInvestor }] = await Promise.all([
    admin.from("startups").select("id").eq("owner_id", user.id).limit(1).maybeSingle(),
    admin.from("investors").select("id").eq("owner_id", user.id).limit(1).maybeSingle(),
  ]);

  let startup_id: string;
  let investor_id: string;

  if (myStartup) {
    const { data: inv } = await admin.from("investors").select("id").eq("id", counterpartId).maybeSingle();
    if (!inv) return NextResponse.json({ error: "Investor not found" }, { status: 404 });
    startup_id  = myStartup.id;
    investor_id = inv.id;
  } else if (myInvestor) {
    const { data: st } = await admin.from("startups").select("id, status").eq("id", counterpartId).maybeSingle();
    if (!st) return NextResponse.json({ error: "Startup not found" }, { status: 404 });
    startup_id  = st.id;
    investor_id = myInvestor.id;
  } else {
    return NextResponse.json({ error: "Complete onboarding first" }, { status: 403 });
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
