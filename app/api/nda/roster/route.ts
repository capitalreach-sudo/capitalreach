import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { resolveEntity } from "@/lib/membership";
import { maskIp } from "@/lib/identity";

/**
 * GET — B24: the founder's NDA & signature roster. Who signed what, when,
 * by which method — the list a lawyer asks for in diligence. Owner/team
 * of the startup only. IPs are masked here (full values stay in the DB
 * for a dispute; the roster is for the founder's eyes, not a data dump).
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const mine = await resolveEntity(user.id, "startup");
  if (!mine) return NextResponse.json({ error: "Founders only" }, { status: 403 });

  const admin = createAdminClient();
  const [{ data: ndas }, { data: contracts }] = await Promise.all([
    admin.from("nda_records")
      .select("id, signed_at, method, nda_version, signed_ip, investor:investors(slug, display_name, firm_name)")
      .eq("startup_id", mine.entityId)
      .not("signed_at", "is", null)
      .order("signed_at", { ascending: false }),
    admin.from("contracts")
      .select("id, contract_type, status, created_at, deal_id, signatures:contract_signatures(id, signer_name, created_at, signed_ip, signer_id)")
      .eq("startup_id", mine.entityId)
      .order("created_at", { ascending: false }),
  ]);

  const nda = (ndas ?? []).map((r) => {
    const inv = r.investor as unknown as { slug: string; display_name: string | null; firm_name: string | null } | null;
    return { id: r.id, signedAt: r.signed_at, method: r.method ?? "clickwrap", version: r.nda_version, ip: maskIp(r.signed_ip), investor: inv ? { slug: inv.slug, name: inv.display_name || inv.firm_name || null } : null };
  });
  const sigs = (contracts ?? []).flatMap((c) => {
    const list = (c.signatures as unknown as Array<{ id: string; signer_name: string; created_at: string; signed_ip: string | null; signer_id: string }>) ?? [];
    return list.map((sg) => ({ id: sg.id, contractId: c.id, dealId: c.deal_id, contractType: c.contract_type, contractStatus: c.status, signerName: sg.signer_name, signedAt: sg.created_at, ip: maskIp(sg.signed_ip), isYou: sg.signer_id === user.id }));
  });
  return NextResponse.json({ nda, signatures: sigs });
}
