import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — CapitalReach",
  description: "How CapitalReach collects, uses, and protects your personal information.",
};

const EFFECTIVE_DATE = "May 26, 2026";

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-12 max-w-3xl">
        {/* Header */}
        <div className="mb-10">
          <p className="text-sm text-cr-copper font-semibold uppercase tracking-wide mb-2">Legal</p>
          <h1 className="text-4xl font-extrabold text-cr-ink mb-3">Privacy Policy</h1>
          <p className="text-cr-i3 text-sm">Effective date: {EFFECTIVE_DATE}</p>
        </div>

        <div className="prose prose-gray max-w-none space-y-8 text-cr-i2 leading-relaxed">

          <section>
            <p>
              CapitalReach ("we," "us," or "our") operates the CapitalReach platform at{" "}
              <a href="https://capitalreach.com" className="text-cr-copper hover:underline">
                capitalreach.com
              </a>{" "}
              (the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your
              information when you use our Service. Please read it carefully.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">1. Information We Collect</h2>
            <h3 className="text-base font-semibold text-[#f0f0f0] mb-2">Information you provide directly</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Account data:</strong> Name, email address, password, and role (startup or investor) when you register.</li>
              <li><strong>Profile data:</strong> Company name, tagline, description, industry, stage, funding details, team information, financial metrics, and documents (startups); investment thesis, check size preferences, industries, and portfolio information (investors).</li>
              <li><strong>Communications:</strong> Messages exchanged between startups and investors on the platform, and contact form submissions.</li>
              <li><strong>Payment data:</strong> Billing information processed through Stripe. We do not store full card numbers — Stripe handles all payment processing.</li>
              <li><strong>Identity verification:</strong> Accreditation certification status for investors.</li>
            </ul>

            <h3 className="text-base font-semibold text-[#f0f0f0] mb-2 mt-4">Information collected automatically</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Usage data:</strong> Pages visited, startup profile views, features used, search queries, and timestamps.</li>
              <li><strong>Device data:</strong> Browser type, operating system, IP address, and referring URLs.</li>
              <li><strong>Cookies:</strong> Session authentication cookies (required for login), and analytics cookies to understand platform usage.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">2. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>To provide, operate, and maintain the Service — including matching startups with investors.</li>
              <li>To process payments and subscriptions through Stripe.</li>
              <li>To send transactional emails: account verification, new messages, deal updates, listing approvals, and subscription receipts.</li>
              <li>To generate AI-powered analysis (pitch feedback, due diligence reports, startup scores) using your profile data with OpenAI's API.</li>
              <li>To improve the platform through anonymized analytics and usage patterns.</li>
              <li>To enforce our{" "}<Link href="/terms" className="text-cr-copper hover:underline">Terms of Service</Link> and prevent fraud or abuse.</li>
              <li>To send periodic product updates and announcements (you can opt out at any time).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">3. How We Share Your Information</h2>
            <p className="text-sm mb-3">
              We do not sell your personal information. We share it only in these circumstances:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li>
                <strong>With other users (by design):</strong> Startup profiles marked "active" are visible to investors on the platform. Investor profiles are visible to startups. You control what information you include in your profile.
              </li>
              <li>
                <strong>With service providers:</strong> We use Supabase (database/auth), Stripe (payments), Resend (email), OpenAI (AI features), Upstash (rate limiting), and Vercel (hosting). Each provider processes only the data necessary for their service and is bound by data processing agreements.
              </li>
              <li>
                <strong>For legal compliance:</strong> If required by law, court order, or to protect the rights, property, or safety of CapitalReach, our users, or the public.
              </li>
              <li>
                <strong>Business transfers:</strong> In the event of a merger, acquisition, or sale of assets, your data may be transferred as part of that transaction.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">4. Data Retention</h2>
            <p className="text-sm">
              We retain your account data for as long as your account is active. If you delete your account, we
              remove your personal information within 30 days, except where we are required to retain it for legal
              obligations (e.g., financial records for tax purposes, which we retain for 7 years). Anonymized,
              aggregated analytics data may be retained indefinitely.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">5. Your Rights and Choices</h2>
            <p className="text-sm mb-3">Depending on your location, you may have the following rights:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
              <li><strong>Correction:</strong> Update inaccurate or incomplete data via your account settings.</li>
              <li><strong>Deletion:</strong> Delete your account through the Danger Zone in Account Settings, or contact us at <a href="mailto:support@capitalreach.com" className="text-cr-copper hover:underline">support@capitalreach.com</a>.</li>
              <li><strong>Portability:</strong> Request your data in a machine-readable format.</li>
              <li><strong>Objection / Restriction:</strong> Object to or restrict certain processing of your data.</li>
              <li><strong>Opt-out of marketing:</strong> Unsubscribe from marketing emails using the link in any marketing email, or contact support.</li>
            </ul>
            <p className="text-sm mt-3">
              To exercise any of these rights, email us at{" "}
              <a href="mailto:support@capitalreach.com" className="text-cr-copper hover:underline">support@capitalreach.com</a>.
              We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">6. Cookies</h2>
            <p className="text-sm mb-3">We use cookies for:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li><strong>Authentication:</strong> To keep you logged in (required, cannot be disabled).</li>
              <li><strong>Preferences:</strong> To remember your settings.</li>
              <li><strong>Analytics:</strong> To understand how the platform is used (you can opt out via browser settings).</li>
            </ul>
            <p className="text-sm mt-2">
              You can control cookies through your browser settings. Disabling authentication cookies will prevent you from logging in.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">7. AI Features and Data Processing</h2>
            <p className="text-sm">
              CapitalReach uses OpenAI's API to power features including pitch analysis, due diligence reports, and
              startup scoring. When you use these features, relevant portions of your profile data are sent to
              OpenAI for processing. OpenAI's{" "}
              <a
                href="https://openai.com/enterprise-privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cr-copper hover:underline"
              >
                Enterprise Privacy Policy
              </a>{" "}
              governs how OpenAI handles this data. We use the API (not ChatGPT), meaning your data is not used
              to train OpenAI's models by default.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">8. Security</h2>
            <p className="text-sm">
              We implement industry-standard security measures including TLS encryption in transit, Row Level
              Security (RLS) in our database so users can only access their own data, and Stripe's PCI-compliant
              payment processing. However, no method of transmission over the internet is 100% secure. We
              encourage you to use a strong, unique password and to contact us immediately at{" "}
              <a href="mailto:support@capitalreach.com" className="text-cr-copper hover:underline">support@capitalreach.com</a>{" "}
              if you suspect unauthorized access to your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">9. Children's Privacy</h2>
            <p className="text-sm">
              CapitalReach is not intended for users under 18 years of age. We do not knowingly collect personal
              information from children. If you believe a child has provided us with personal information, please
              contact us and we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">10. International Transfers</h2>
            <p className="text-sm">
              CapitalReach is operated in the United States. If you access our Service from outside the US, your
              information may be transferred to, stored, and processed in the US and other countries where our
              service providers operate. By using our Service, you consent to these transfers. We ensure
              appropriate safeguards are in place for international transfers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">11. Changes to This Policy</h2>
            <p className="text-sm">
              We may update this Privacy Policy from time to time. We will notify you of material changes by
              posting the new policy on this page and updating the effective date at the top. For significant
              changes, we will also send an email notification to your registered address. Continued use of the
              Service after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">12. Contact Us</h2>
            <p className="text-sm">
              If you have questions, concerns, or requests regarding this Privacy Policy or our data practices,
              please contact us:
            </p>
            <div className="mt-3 bg-cr-paper border rounded-xl p-4 text-sm">
              <p className="font-semibold text-cr-ink">CapitalReach</p>
              <p className="text-cr-i3">Email: <a href="mailto:support@capitalreach.com" className="text-cr-copper hover:underline">support@capitalreach.com</a></p>
              <p className="text-cr-i3 mt-1">
                <Link href="/contact" className="text-cr-copper hover:underline">Contact Form →</Link>
              </p>
            </div>
          </section>

        </div>

        {/* Footer links */}
        <div className="mt-12 pt-8 border-t flex flex-wrap gap-4 text-sm text-cr-i3">
          <Link href="/terms" className="hover:text-cr-copper">Terms of Service</Link>
          <Link href="/contact" className="hover:text-cr-copper">Contact Us</Link>
          <Link href="/" className="hover:text-cr-copper">Back to CapitalReach</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
