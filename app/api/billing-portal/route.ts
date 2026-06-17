import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createCustomerPortalSession } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account found. Subscribe to a paid plan first." }, { status: 400 });
  }

  const returnUrl =
    profile.role === "startup"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/startup/billing`
      : `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/investor/billing`;

  const session = await createCustomerPortalSession(profile.stripe_customer_id, returnUrl);
  return NextResponse.json({ url: session.url });
}
