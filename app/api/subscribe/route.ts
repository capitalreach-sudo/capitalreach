import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { contactRatelimit, isRedisConfigured } from "@/lib/redis";
import { sendSubscribeWelcomeEmail } from "@/lib/resend";
import { clientIp } from "@/lib/client-ip";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * POST { email } — Dispatch (blog) subscription. No account required.
 *
 * Fails CLOSED without Redis, exactly like /api/contact: this route inserts a
 * row and sends an email per call, so an unmetered version is an email-bombing
 * and DB-spam vector. The old `if (isRedisConfigured)` wrapper SKIPPED the
 * limiter entirely in prod (no Redis), leaving it wide open. When Redis is
 * configured the per-IP ceiling applies.
 *
 * Answered with a single opaque body: the response never reveals whether the
 * address was already subscribed. The earlier `{ already: true|false }` flag,
 * combined with the send-email-only-for-new side effect, let an unauthenticated
 * caller enumerate which addresses are on the list -- the exact leak the
 * docstring claimed to prevent.
 */
export async function POST(req: NextRequest) {
  if (!isRedisConfigured) {
    return NextResponse.json(
      { error: "Subscriptions are temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }
  const ip = clientIp(req.headers);
  const { success } = await contactRatelimit.limit(`subscribe:${ip}`).catch(() => ({ success: true }));
  if (!success) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  try {
    const admin = createAdminClient();
    const { data: existing } = await admin.from("subscribers").select("id").eq("email", email).maybeSingle();
    // New addresses get a row and a welcome email; a repeat is a silent no-op.
    // Either way the caller sees the same body, so the response is not an
    // is-this-address-subscribed oracle.
    if (!existing) {
      const { error } = await admin.from("subscribers").insert({ email, source: typeof body.source === "string" ? body.source.slice(0, 40) : "blog" });
      if (error && error.code !== "23505") throw error;
      if (!error) await sendSubscribeWelcomeEmail(email).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[subscribe]", err);
    return NextResponse.json({ error: "Could not subscribe right now." }, { status: 500 });
  }
}
