import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { sendContractStatusEmail } from "@/lib/resend";
import type { ContractStatus } from "@/types";

const CONTRACT_STATUSES: ContractStatus[] = ["draft", "sent", "signed", "void"];

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contractId, status } = await req.json();
  if (!contractId || !CONTRACT_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Missing contract or invalid status" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: contract } = await admin
    .from("contracts")
    .select("id, deal_id, startup_id, investor_id, title")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const [{ data: startup }, { data: investor }, { data: profile }] = await Promise.all([
    admin.from("startups").select("id, name, owner_id").eq("id", contract.startup_id).maybeSingle(),
    admin.from("investors").select("id, owner_id").eq("id", contract.investor_id).maybeSingle(),
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  const isParticipant = startup?.owner_id === user.id || investor?.owner_id === user.id;
  if (!isParticipant && profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: updated, error } = await admin
    .from("contracts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", contractId)
    .select()
    .single();
  if (error || !updated) return NextResponse.json({ error: "Failed to update contract" }, { status: 500 });

  await admin.from("deal_activity").insert({
    deal_id: contract.deal_id,
    startup_id: contract.startup_id,
    investor_id: contract.investor_id,
    actor_id: user.id,
    type: "contract_status",
    body: status,
  });

  if (status === "sent" || status === "signed") {
    const [{ data: startupOwner }, { data: investorOwner }] = await Promise.all([
      admin.from("profiles").select("email, full_name").eq("id", startup?.owner_id).maybeSingle(),
      admin.from("profiles").select("email, full_name").eq("id", investor?.owner_id).maybeSingle(),
    ]);
    const dealUrl = `${process.env.NEXT_PUBLIC_APP_URL}/deals`;
    const notifications: Promise<unknown>[] = [];
    if (startupOwner?.email) {
      notifications.push(sendContractStatusEmail(startupOwner.email, startupOwner.full_name || "there", contract.title, status, dealUrl));
    }
    if (investorOwner?.email) {
      notifications.push(sendContractStatusEmail(investorOwner.email, investorOwner.full_name || "there", contract.title, status, dealUrl));
    }
    await Promise.all(notifications).catch(() => {});
  }

  return NextResponse.json({ success: true, contract: updated });
}
