import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY!);

const FROM = process.env.RESEND_FROM_EMAIL || "noreply@capitalreach.com";

async function send(
  to: string,
  subject: string,
  html: string,
  tags?: Array<{ name: string; value: string }>
) {
  try {
    const result = await resend.emails.send({ from: FROM, to, subject, html, tags });
    return result;
  } catch (err) {
    console.error("[Resend] Email send failed:", err);
    throw err;
  }
}

export async function sendWelcomeEmail(to: string, name: string, role: string) {
  const isStartup = role === "startup";
  return send(
    to,
    "Welcome to CapitalReach",
    `<h2>Welcome to CapitalReach, ${name}!</h2>
    <p>You've joined as a${isStartup ? " startup founder" : "n investor"}.</p>
    <p>${isStartup
      ? "Complete your startup profile to get listed and start attracting investors."
      : "Set up your investor profile and start discovering exceptional startups."}</p>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/onboarding/${role}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Complete Your Profile →</a></p>
    <p>The CapitalReach Team</p>`
  );
}

export async function sendEmailVerification(to: string, verifyUrl: string) {
  return send(
    to,
    "Verify your CapitalReach email",
    `<h2>Verify your email address</h2>
    <p>Click the button below to verify your email and access your account.</p>
    <p><a href="${verifyUrl}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Verify Email →</a></p>
    <p>This link expires in 24 hours.</p>`
  );
}

export async function sendProfileUnderReviewEmail(to: string, startupName: string) {
  return send(
    to,
    `${startupName} — Profile submitted for review`,
    `<h2>Your profile is under review</h2>
    <p>Thanks for submitting <strong>${startupName}</strong> to CapitalReach!</p>
    <p>Our team will review your listing within 1-2 business days. You'll receive an email as soon as it's approved.</p>
    <p>While you wait, you can continue editing your profile in your dashboard.</p>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/startup">View Dashboard →</a></p>`
  );
}

export async function sendListingLiveEmail(to: string, startupName: string, slug: string) {
  return send(
    to,
    `🎉 ${startupName} is now live on CapitalReach!`,
    `<h2>Your listing is live!</h2>
    <p>Congratulations — <strong>${startupName}</strong> is now publicly listed on CapitalReach and visible to investors.</p>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/startups/${slug}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">View Your Listing →</a></p>
    <p>Share your profile link with potential investors to boost your visibility.</p>`
  );
}

export async function sendListingRejectedEmail(to: string, startupName: string, reason: string) {
  return send(
    to,
    `${startupName} — Review update`,
    `<h2>Your listing needs some updates</h2>
    <p>Thank you for submitting <strong>${startupName}</strong> to CapitalReach.</p>
    <p>After review, we weren't able to approve your listing at this time. Here's why:</p>
    <blockquote style="border-left:3px solid #e5e7eb;padding-left:16px;color:#6b7280">${reason}</blockquote>
    <p>Please update your profile and resubmit. Our team is happy to help.</p>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/startup">Update Profile →</a></p>`
  );
}

export async function sendNewMessageEmail(
  to: string,
  senderName: string,
  startupName: string,
  preview: string
) {
  return send(
    to,
    `New message from ${senderName}`,
    `<h2>You have a new message</h2>
    <p><strong>${senderName}</strong> sent you a message about <strong>${startupName}</strong>:</p>
    <blockquote style="border-left:3px solid #4f46e5;padding-left:16px;color:#374151">${preview.substring(0, 200)}${preview.length > 200 ? "..." : ""}</blockquote>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/messages" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Reply →</a></p>`
  );
}

export async function sendDealClosedEmail(
  startupEmail: string,
  investorEmail: string,
  startupName: string,
  investorName: string,
  amount: number,
  invoiceUrl: string,
  currency: string = "USD"
) {
  const { formatMoney } = await import("@/lib/currency");
  const congrats = (name: string, counterparty: string) =>
    `<h2>🎉 Deal Closed — ${startupName}</h2>
    <p>Congratulations <strong>${name}</strong>! A deal between <strong>${startupName}</strong> and <strong>${counterparty}</strong> has been marked as closed.</p>
    <p><strong>Amount Raised:</strong> ${formatMoney(amount, currency)}</p>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard">View Dashboard →</a></p>`;

  await Promise.all([
    send(startupEmail, `Deal Closed — Success fee invoice`,
      congrats(startupName, investorName) +
      `<p>A 2% success fee invoice of <strong>${formatMoney(amount * 0.02, currency)}</strong> has been generated. <a href="${invoiceUrl}">View Invoice →</a></p>`),
    send(investorEmail, `Deal Closed — ${startupName}`,
      congrats(investorName, startupName)),
  ]);
}

export async function sendContractStatusEmail(
  to: string,
  recipientName: string,
  contractTitle: string,
  status: "sent" | "signed",
  dealUrl: string
) {
  const verb = status === "sent" ? "sent for signature" : "signed";
  return send(
    to,
    `Contract ${status === "sent" ? "Sent" : "Signed"} — ${contractTitle}`,
    `<h2>Contract ${verb}</h2>
    <p>Hi ${recipientName},</p>
    <p><strong>${contractTitle}</strong> has been ${verb}.</p>
    <p><a href="${dealUrl}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">View Deal →</a></p>`
  );
}

export async function sendNdaSignedEmail(
  startupEmail: string,
  investorEmail: string,
  startupName: string
) {
  const body = `<h2>NDA Signed — ${startupName}</h2>
    <p>Both parties have signed the NDA. Sensitive documents are now accessible.</p>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/startups/${startupName.toLowerCase().replace(/\s+/g, "-")}">View Documents →</a></p>`;

  await Promise.all([
    send(startupEmail, `NDA Signed — ${startupName}`, body),
    send(investorEmail, `NDA Signed — ${startupName}`, body),
  ]);
}

export async function sendSubscriptionCancelledEmail(to: string, name: string, tier: string) {
  return send(
    to,
    "Your CapitalReach subscription has been cancelled",
    `<h2>We're sorry to see you go, ${name}</h2>
    <p>Your <strong>${tier}</strong> subscription has been cancelled. You'll retain access until the end of your billing period.</p>
    <p>Changed your mind? You can reactivate anytime.</p>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Reactivate →</a></p>`
  );
}

export async function sendPaymentFailedEmail(to: string, name: string, attempt: 1 | 2 | 3) {
  const messages = {
    1: { subject: "Payment failed — action required", body: "Your payment failed. Please update your payment method to keep your listing active." },
    2: { subject: "Reminder: Payment still failing", body: "We tried to charge you again but the payment failed. Please update your card now." },
    3: { subject: "⚠️ Account suspension warning", body: "Your account will be suspended in 24 hours if payment is not received. Please update your payment method immediately." },
  };

  return send(
    to,
    messages[attempt].subject,
    `<h2>Hi ${name},</h2>
    <p>${messages[attempt].body}</p>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Update Payment Method →</a></p>`
  );
}

export async function sendWeeklyDigest(
  to: string,
  name: string,
  startups: Array<{ name: string; tagline: string; slug: string; industry: string; stage: string }>
) {
  const startupCards = startups
    .slice(0, 5)
    .map(s => `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:12px">
      <strong>${s.name}</strong> <span style="color:#6b7280;font-size:12px">${s.industry} · ${s.stage}</span>
      <p style="margin:4px 0;color:#374151">${s.tagline}</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/startups/${s.slug}" style="color:#4f46e5;font-size:14px">View Profile →</a>
    </div>`)
    .join("");

  return send(
    to,
    `Your weekly deal flow — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}`,
    `<h2>Good morning, ${name}!</h2>
    <p>Here are this week's top startups matching your investment preferences:</p>
    ${startupCards}
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Browse All Startups →</a></p>`
  );
}

export async function sendViewsDigestEmail(
  to: string,
  startupName: string,
  viewCount: number,
  saveCount: number
) {
  return send(
    to,
    `${startupName} — ${viewCount} investor views today`,
    `<h2>Daily Activity Update</h2>
    <p>Here's how <strong>${startupName}</strong> performed today:</p>
    <ul>
      <li>👁️ <strong>${viewCount}</strong> profile views</li>
      <li>⭐ <strong>${saveCount}</strong> investors saved your profile</li>
    </ul>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/startup">View Full Analytics →</a></p>`
  );
}
