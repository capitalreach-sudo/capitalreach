import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { name, email, subject, message, company } = await req.json();

    if (!name || !email || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const SUBJECT_LABELS: Record<string, string> = {
      institutional: "Institutional / Enterprise Inquiry",
      billing: "Billing & Subscriptions",
      technical: "Technical Support",
      partnership: "Partnership Opportunity",
      general: "General Question",
    };

    const subjectLabel = SUBJECT_LABELS[subject] ?? subject;

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: "support@capitalreach.com",
      replyTo: email,
      subject: `[CapitalReach Contact] ${subjectLabel} — ${name}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <table style="border-collapse: collapse; width: 100%; font-family: sans-serif;">
          <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">From</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${name} &lt;${email}&gt;</td></tr>
          ${company ? `<tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Company</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${company}</td></tr>` : ""}
          <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Subject</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${subjectLabel}</td></tr>
        </table>
        <div style="margin-top: 20px; padding: 16px; background: #f9f9f9; border-radius: 8px; font-family: sans-serif;">
          <p style="margin: 0; white-space: pre-wrap;">${message}</p>
        </div>
        <p style="margin-top: 20px; font-size: 12px; color: #999;">Sent via CapitalReach contact form</p>
      `,
    });

    // Also send confirmation to the user
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: email,
      subject: "We received your message — CapitalReach",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Thanks for reaching out, ${name.split(" ")[0]}!</h2>
          <p style="color: #555;">We've received your message and will get back to you within 1 business day.</p>
          <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; font-size: 13px; color: #777;">Your message:</p>
            <p style="margin: 8px 0 0; white-space: pre-wrap; font-size: 14px;">${message}</p>
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
