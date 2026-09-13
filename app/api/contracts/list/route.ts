import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isTeamMemberOfEither } from "@/lib/membership";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealId = req.nextUrl.searchParams.get("dealId");
  if (!dealId) return NextResponse.json({ error: "Missing dealId" }, { status: 400 });

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
  const isParticipant = startup?.owner_id === user.id || investor?.owner_id === user.id
    || await isTeamMemberOfEither(user.id, deal.startup_id, deal.investor_id);
  if (!isParticipant && profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: contracts, error } = await admin
    .from("contracts")
    .select("*")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Failed to load contracts" }, { status: 500 });

  // Per-contract signature state. Signing writes contract_signatures but the
  // contract row's status only flips once BOTH sides have signed, so without
  // this the card cannot tell a viewer their own signature landed.
  const ids = (contracts ?? []).map((c) => c.id);
  const sigsFor = new Map<string, { mine: boolean; count: number }>();
  if (ids.length > 0) {
    const { data: sigs } = await admin
      .from("contract_signatures")
      .select("contract_id, signer_id")
      .in("contract_id", ids);
    for (const s of sigs ?? []) {
      const cur = sigsFor.get(s.contract_id) ?? { mine: false, count: 0 };
      cur.count += 1;
      if (s.signer_id === user.id) cur.mine = true;
      sigsFor.set(s.contract_id, cur);
    }
  }

  return NextResponse.json({
    contracts: (contracts ?? []).map((c) => ({
      ...c,
      signatures: sigsFor.get(c.id) ?? { mine: false, count: 0 },
    })),
    // lib/env.ts already treats placeholder keys as unset. The client uses
    // this to withhold the NDA "send for signature" action, which can only
    // 503 while no DocuSign account is connected.
    docusignConfigured: !!env.docusign.integrationKey,
  });
}
