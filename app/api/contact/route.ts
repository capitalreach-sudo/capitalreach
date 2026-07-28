import { NextRequest, NextResponse } from "next/server";
import { resend } from "@/lib/resend";
import { contactRatelimit } from "@/lib/redis";
import { env, isResendConfigured } from "@/lib/env";

// Every value below is attacker-controlled and lands in an HTML email body.
// Without escaping, a message containing markup is rendered as markup in the
// support inbox -- an <a href> pointing anywhere, styled to look like ours.
function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MAX = { name: 100, email: 254, company: 200, message: 5000 };

export async function POST(req: NextRequest) {
  try {
    // Unauthenticated, and it sends two emails per call. Cap it per IP.
    // Note: this degrades to a no-op when Upstash is not configured -- see the
    // MOCK_LIMITER in lib/redis.ts.
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const { success } = await contactRatelimit.limit(ip);
    if (!success) {
      return NextResponse.json(
        { error: "Too many messages. Please try again later." },
        { status: 429 }
      );
    }

    // Refuse rather than fall back. See the note on env.resend.contactInbox:
    // the previous hardcoded recipient was a domain we do not own.
    //
    // isResendConfigured is checked here too, and it matters: lib/resend's
    // wrapper deliberately no-ops when there is no API key, so without this the
    // route would run to completion and return {success:true} for a message
    // that was never sent. Telling someone their enquiry was received when it
    // went nowhere is worse than telling them the form is down.
    if (!env.resend.contactInbox || !isResendConfigured) {
      console.error(
        "[contact] refusing to send —",
        !env.resend.contactInbox ? "CONTACT_INBOX_EMAIL is not set" : "RESEND_API_KEY is not set"
      );
      return NextResponse.json(
        { error: "The contact form is unavailable right now." },
        { status: 503 }
      );
    }

    const { name, email, subject, message, company } = await req.json();

    if (!name || !email || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    if (
      String(name).length > MAX.name ||
      String(email).length > MAX.email ||
      String(company ?? "").length > MAX.company ||
      String(message).length > MAX.message
    ) {
      return NextResponse.json({ error: "Message too long" }, { status: 400 });
    }

    const SUBJECT_LABELS: Record<string, string> = {
      institutional: "Institutional / Enterprise Inquiry",
      billing: "Billing & Subscriptions",
      technical: "Technical Support",
      partnership: "Partnership Opportunity",
      general: "General Question",
    };

    // Unknown subjects fall back to a fixed label rather than echoing the input,
    // because this value is also used in the (unescapable) Subject header.
    const subjectLabel = SUBJECT_LABELS[subject] ?? SUBJECT_LABELS.general;

    const safe = {
      name: escapeHtml(name),
      email: escapeHtml(email),
      company: escapeHtml(company),
      message: escapeHtml(message),
    };
    const headerName = String(name).replace(/[\r\n]/g, " ").slice(0, MAX.name);

    await resend.emails.send({
      from: env.resend.fromEmail,
      to: env.resend.contactInbox,
      replyTo: email,
      subject: `[CapitalReach Contact] ${subjectLabel} — ${headerName}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <table style="border-collapse: collapse; width: 100%; font-family: sans-serif;">
          <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">From</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe.name} &lt;${safe.email}&gt;</td></tr>
          ${company ? `<tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Company</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe.company}</td></tr>` : ""}
          <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Subject</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${subjectLabel}</td></tr>
        </table>
        <div style="margin-top: 20px; padding: 16px; background: #f9f9f9; border-radius: 8px; font-family: sans-serif;">
          <p style="margin: 0; white-space: pre-wrap;">${safe.message}</p>
        </div>
        <p style="margin-top: 20px; font-size: 12px; color: #999;">Sent via CapitalReach contact form</p>
      `,
    });

    // Also send confirmation to the user
    await resend.emails.send({
      from: env.resend.fromEmail,
      to: email,
      subject: "We received your message — CapitalReach",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Thanks for reaching out, ${escapeHtml(String(name).split(" ")[0])}!</h2>
          <p style="color: #555;">We've received your message and will get back to you within 1 business day.</p>
          <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; font-size: 13px; color: #777;">Your message:</p>
            <p style="margin: 8px 0 0; white-space: pre-wrap; font-size: 14px;">${safe.message}</p>
          </div>
          <p style="color: #555; font-size: 13px;">— The CapitalReach Team</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Contact form error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
