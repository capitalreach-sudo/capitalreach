import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isTeamMemberOfEither } from "@/lib/membership";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { notifyUsers } from "@/lib/notify-user";
import { createHash } from "crypto";

/** Canonical, order-stable representation of what is being signed. Any later
 *  edit to these fields changes the hash, so a signature can't be silently
 *  re-pointed at different terms. */
function contentHash(c: {
  title: string | null; contract_type: string | null;
  amount: number | null; equity_percent: number | null; terms: string | null;
}): string {
  const canonical = [
    `title:${c.title ?? ""}`,
    `type:${c.contract_type ?? ""}`,
    `amount:${c.amount ?? ""}`,
    `equity:${c.equity_percent ?? ""}`,
    `terms:${(c.terms ?? "").trim()}`,
  ].join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  const { contractId, signerName } = await req.json().catch(() => ({}));
  if (typeof contractId !== "string" || typeof signerName !== "string" || signerName.trim().length < 2) {
    return NextResponse.json({ error: "Type your full legal name to sign" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: contract } = await admin
    .from("contracts")
    .select("id, deal_id, startup_id, investor_id, created_by, status, title, contract_type, amount, equity_percent, terms, startup:startups(name, owner_id), investor:investors(owner_id)")
    .eq("id", contractId)
    .single();
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  if (contract.status === "void") {
    return NextResponse.json({ error: "This contract has been voided" }, { status: 400 });
  }

  // Only a participant (or team member) may sign.
  const startupOwner = (contract.startup as { owner_id?: string } | null)?.owner_id;
  const investorOwner = (contract.investor as { owner_id?: string } | null)?.owner_id;
  const isParticipant =
    startupOwner === user.id ||
    investorOwner === user.id ||
    (await isTeamMemberOfEither(user.id, contract.startup_id, contract.investor_id));
  if (!isParticipant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const hash = contentHash(contract);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent")?.slice(0, 400) ?? null;

  const { error: sigErr } = await admin.from("contract_signatures").upsert(
    {
      contract_id: contractId,
      signer_id: user.id,
      signer_name: signerName.trim().slice(0, 120),
      content_hash: hash,
      signed_ip: ip,
      signed_ua: ua,
    },
    { onConflict: "contract_id,signer_id" },
  );
  if (sigErr) {
    console.error("[contracts/sign] signature insert failed:", sigErr.message);
    return NextResponse.json({ error: "Could not record signature" }, { status: 500 });
  }

  // A contract is executed only when a signer from the OPPOSITE MARKET SIDE
  // has signed — not merely "someone other than the creator". The old check
  // let an attacker add a sockpuppet to their OWN team and self-execute the
  // agreement (and, downstream, force-close the deal and raise the founder's
  // 2% fee). "Side" = which entity the person owns or is a team member of.
  const sideOf = async (uid: string): Promise<"startup" | "investor" | null> => {
    if (uid === startupOwner) return "startup";
    if (uid === investorOwner) return "investor";
    if (await isTeamMemberOfEither(uid, contract.startup_id, null)) return "startup";
    if (await isTeamMemberOfEither(uid, null, contract.investor_id)) return "investor";
    return null;
  };
  const [creatorSide, signerSide] = await Promise.all([sideOf(contract.created_by), sideOf(user.id)]);
  const counterpartSigned = !!signerSide && !!creatorSide && signerSide !== creatorSide;
  let updated = contract;
  if (counterpartSigned && contract.status !== "signed") {
    const { data: row } = await admin
      .from("contracts")
      .update({ status: "signed" })
      .eq("id", contractId)
      .select("*")
      .single();
    if (row) updated = { ...contract, ...row };

    await admin.from("deal_activity").insert({
      deal_id: contract.deal_id,
      startup_id: contract.startup_id,
      investor_id: contract.investor_id,
      actor_id: user.id,
      type: "contract_status",
      body: `${contract.title ?? "Contract"} signed`,
    }).then(undefined, () => {});

    await notifyUsers([startupOwner, investorOwner], {
      type: "contract_status",
      title: `Contract signed — ${contract.title ?? "agreement"}`,
      body: `${signerName.trim()} signed. The agreement is now executed.`,
      href: `/deals?deal=${contract.deal_id}`,
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, contract: updated, signedAt: new Date().toISOString() });
}
