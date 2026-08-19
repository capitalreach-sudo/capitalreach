import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/utils";

/**
 * C33: opt-in co-investor visibility. Off by default. When an investor
 * turns it on for one of their own deals, other *investors* on the platform
 * can see that they are looking at that company — never the amount, never
 * the stage, and never anything to the public or to the founder beyond what
 * the founder already sees in their own pipeline.
 *
 * POST { dealId, publicInterest: boolean }
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dealId, publicInterest } = await req.json().catch(() => ({}));
  if (!isUuid(dealId ?? "")) return NextResponse.json({ error: "dealId required" }, { status: 400 });
  if (typeof publicInterest !== "boolean") return NextResponse.json({ error: "publicInterest must be a boolean" }, { status: 400 });

  const admin = createAdminClient();
  const { data: inv } = await admin.from("investors").select("id").eq("owner_id", user.id).maybeSingle();
  if (!inv) return NextResponse.json({ error: "Investors only" }, { status: 403 });

  // Only the investor side of their own deal may flip this.
  const { data, error } = await admin
    .from("deals")
    .update({ public_interest: publicInterest })
    .match({ id: dealId, investor_id: inv.id })
    .select("id, public_interest")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not update" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not your deal" }, { status: 404 });
  return NextResponse.json({ success: true, publicInterest: data.public_interest });
}
