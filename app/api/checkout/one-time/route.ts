import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { amount, startupId, type } = await req.json();
  if (!amount || amount < 1) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: type === "due_diligence" ? "AI Due Diligence Report" : "CapitalReach Purchase",
              description: type === "due_diligence" ? "One-time AI investment memo for a startup on CapitalReach" : undefined,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/ai?diligence_success=1${startupId ? `&startupId=${startupId}` : ""}`,
      cancel_url: `${baseUrl}/ai`,
      customer_email: user.email ?? undefined,
      metadata: {
        userId: user.id,
        startupId: startupId ?? "",
        type: type ?? "one_time",
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[checkout/one-time]", err);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
