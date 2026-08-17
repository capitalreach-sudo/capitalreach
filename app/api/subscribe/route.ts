import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { contactRatelimit, isRedisConfigured } from "@/lib/redis";
import { sendSubscribeWelcomeEmail } from "@/lib/resend";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * POST { email } — Dispatch (blog) subscription. No account required.
 * Rate limited per IP, validated, upserted (a repeat is "already subscribed",
 * never an error), and answered with a welcome email when mail is
 * configured. Always 200 on a good address so the form never leaks whether
 * an address was already known.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (isRedisConfigured) {
    const { success } = await contactRatelimit.limit(`subscribe:${ip}`).catch(() => ({ success: true }));
    if (!success) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  try {
    const admin = createAdminClient();
    const { data: existing } = await admin.from("subscribers").select("id").eq("email", email).maybeSingle();
    if (existing) return NextResponse.json({ ok: true, already: true });
    const { error } = await admin.from("subscribers").insert({ email, source: typeof body.source === "string" ? body.source.slice(0, 40) : "blog" });
    if (error && error.code !== "23505") throw error;
    await sendSubscribeWelcomeEmail(email).catch(() => {});
    return NextResponse.json({ ok: true, already: !!error });
  } catch (err) {
    console.error("[subscribe]", err);
    return NextResponse.json({ error: "Could not subscribe right now." }, { status: 500 });
  }
}
