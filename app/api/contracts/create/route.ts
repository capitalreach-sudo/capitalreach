import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isCurrencyCode, DEFAULT_CURRENCY } from "@/lib/currency";
import type { ContractType } from "@/types";

const CONTRACT_TYPES: ContractType[] = ["term_sheet", "safe", "convertible_note", "nda", "custom"];

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dealId, title, contractType, amount, currency, equityPercent, terms } = await req.json();
  if (!dealId || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Missing deal or title" }, { status: 400 });
  }
  const type: ContractType = CONTRACT_TYPES.includes(contractType) ? contractType : "term_sheet";
  const dealCurrency = isCurrencyCode(currency) ? currency : DEFAULT_CURRENCY;
  const parsedAmount = typeof amount === "number" && amount > 0 ? Math.round(amount) : null;
  const parsedEquity = typeof equityPercent === "number" && equityPercent > 0 && equityPercent <= 100
    ? Math.round(equityPercent * 100) / 100
    : null;

  const admin = createAdminClient();

  const { data: deal } = await admin
    .from("deals")
    .select("id, startup_id, investor_id")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const [{ data: startup }, { data: investor }, { data: profile }] = await Promise.all([
    admin.from("startups").select("id, owner_id").eq("id", deal.startup_id).maybeSingle(),
    admin.from("investors").select("id, owner_id").eq("id", deal.investor_id).maybeSingle(),
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  const isParticipant = startup?.owner_id === user.id || investor?.owner_id === user.id;
  if (!isParticipant && profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: contract, error } = await admin
    .from("contracts")
    .insert({
      deal_id: deal.id,
      startup_id: deal.startup_id,
      investor_id: deal.investor_id,
      created_by: user.id,
      title: title.trim(),
      contract_type: type,
      amount: parsedAmount,
      currency: dealCurrency,
      equity_percent: parsedEquity,
      terms: typeof terms === "string" && terms.trim() ? terms.trim() : null,
    })
    .select()
    .single();
  if (error || !contract) {
    return NextResponse.json({ error: "Failed to create contract" }, { status: 500 });
  }

  return NextResponse.json({ success: true, contract });
}
