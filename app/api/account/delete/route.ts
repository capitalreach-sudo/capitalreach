import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();

  try {
    // Cancel Stripe subscription if one exists (best-effort)
    const { data: profile } = await adminClient
      .from("profiles")
      .select("stripe_customer_id, role")
      .eq("id", user.id)
      .single();

    if (profile?.stripe_customer_id) {
      try {
        const { stripe } = await import("@/lib/stripe");
        const subs = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, limit: 10 });
        await Promise.all(
          subs.data
            .filter(s => s.status === "active" || s.status === "trialing")
            .map(s => stripe.subscriptions.cancel(s.id))
        );
      } catch {
        // Non-fatal — proceed with deletion even if Stripe fails
      }
    }

    // Delete the user from Supabase Auth — this cascades to profiles (and all related
    // data) because of ON DELETE CASCADE foreign keys set up in the schema.
    const { error } = await adminClient.auth.admin.deleteUser(user.id);

    if (error) {
      console.error("[account/delete] deleteUser error:", error);
      return NextResponse.json({ error: "Failed to delete account. Please contact support@capitalreach.com." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[account/delete]", err);
    return NextResponse.json({ error: "Deletion failed. Please contact support@capitalreach.com." }, { status: 500 });
  }
}
