import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * D43: an investor's deployment plan for the period. The target is stored;
 * committed and deployed are always derived from deals, never stored twice —
 * a second copy of a number is a second chance to be wrong.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { target, period } = await req.json().catch(() => ({}));
  const patch: { allocation_target?: number | null; allocation_period?: string | null } = {};
  if (target !== undefined) {
    if (target !== null && (typeof target !== "number" || !Number.isFinite(target) || target < 0 || target > 1e12)) {
      return NextResponse.json({ error: "invalid target" }, { status: 400 });
    }
    patch.allocation_target = target === null ? null : Math.round(target);
  }
  if (period !== undefined) patch.allocation_period = typeof period === "string" && period.trim() ? period.trim().slice(0, 40) : null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data, error } = await supabase
    .from("investors").update(patch).eq("owner_id", user.id)
    .select("allocation_target, allocation_period").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No investor profile" }, { status: 403 });
  return NextResponse.json({ allocation: data });
}
