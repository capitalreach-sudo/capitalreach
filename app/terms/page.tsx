import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { TrendingUp } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service — CapitalReach",
  description: "CapitalReach Terms of Service. Read our terms and conditions before using the platform.",
};

export default function TermsPage() {
  const lastUpdated = "May 25, 2026";

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-16 max-w-3xl">
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-cr-cu-d rounded-lg flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <span className="text-sm font-medium text-cr-copper">CapitalReach</span>
          </div>
          <h1 className="text-4xl font-bold text-cr-ink mb-3">Terms of Service</h1>
          <p className="text-sm text-cr-i4">Last updated: {lastUpdated}</p>
        </div>

        <div className="prose prose-gray max-w-none space-y-8">

          <section>
            <p className="text-cr-i3 leading-relaxed">
              Welcome to CapitalReach. These Terms of Service ("Terms") govern your access to and use of the CapitalReach
              platform, website, and services (collectively, the "Service") operated by CapitalReach, Inc. ("CapitalReach",
              "we", "us", or "our"). By creating an account or using the Service, you agree to be bound by these Terms.
              If you do not agree to these Terms, do not use the Service.
            </p>
          </section>

          <Section title="1. Eligibility">
            <p>
              You must be at least 18 years old to use CapitalReach. By using the Service, you represent and warrant
              that you meet this requirement and have the legal capacity to enter into a binding agreement. If you
              are accessing the Service on behalf of a company or organisation, you represent that you have authority
              to bind that entity to these Terms.
            </p>
            <p className="mt-3">
              Investment-related information on CapitalReach is intended for use by sophisticated and accredited investors
              as defined under applicable securities laws (including Rule 501 of Regulation D under the U.S. Securities
              Act of 1933). CapitalReach does not verify investor accreditation status and it is your responsibility to
              ensure compliance with applicable laws in your jurisdiction.
            </p>
          </Section>

          <Section title="2. Description of Service">
            <p>
              CapitalReach is a marketplace platform that enables:
            </p>
            <ul className="mt-3 space-y-1.5 list-disc pl-5 text-cr-i3">
              <li><strong>Startups</strong> to create profiles, list funding rounds, and connect with potential investors.</li>
              <li><strong>Investors</strong> to discover, evaluate, and contact startups raising capital.</li>
              <li>Both parties to use AI-powered tools including pitch analysis, due diligence reports, and smart matching.</li>
              <li>Messaging and document exchange between startups and investors on the platform.</li>
            </ul>
            <p className="mt-3">
              CapitalReach is a technology platform only. We do not provide investment advice, act as a broker-dealer,
              investment adviser, or intermediary in any securities transaction. We do not recommend specific investments.
            </p>
          </Section>

          <Section title="3. Accounts and Registration">
            <p>
              When you create an account, you agree to provide accurate, current, and complete information. You are
              responsible for maintaining the confidentiality of your login credentials and for all activity that
              occurs under your account. You must notify us immediately at{" "}
              <a href="mailto:support@capitalreach.com" className="text-cr-copper hover:underline">
                support@capitalreach.com
              </a>{" "}
              if you suspect any unauthorised use of your account.
            </p>
            <p className="mt-3">
              You may not create multiple accounts, transfer your account to another person, or use another person's
              account without their permission. We reserve the right to suspend or terminate accounts that violate
              these Terms.
            </p>
          </Section>

          <Section title="4. Subscription Plans and Fees">
            <p>
              CapitalReach offers free and paid subscription tiers for both startups and investors. Paid plans are billed
              on a monthly recurring basis through our payment processor, Stripe.
            </p>

            <h3 className="font-semibold text-cr-ink mt-4 mb-2">4.1 Free Period</h3>
            <p>
              During CapitalReach's early launch period, all subscription tiers are provided at no charge until the
              platform reaches 100 registered users. Once this threshold is reached, standard pricing as published
              on the{" "}
              <Link href="/pricing" className="text-cr-copper hover:underline">Pricing page</Link> will apply.
              Users on paid plans at the time the free period ends will be notified by email at least 7 days before
              any charges occur.
            </p>

            <h3 className="font-semibold text-cr-ink mt-4 mb-2">4.2 Success Fee</h3>
            <p>
              Startups that close a funding round through introductions made on CapitalReach are subject to a 2% success
              fee on the total amount raised from investors connected through the platform. This fee is invoiced after
              round closure and is due within 14 days of the invoice date. No success fee is charged on capital raised
              from sources not connected through CapitalReach.
            </p>

            <h3 className="font-semibold text-cr-ink mt-4 mb-2">4.3 Cancellations and Refunds</h3>
            <p>
              You may cancel your subscription at any time from your account settings. Cancellation takes effect at
              the end of the current billing period. We do not offer prorated refunds for partial billing periods,
              except where required by applicable law. Refund requests for exceptional circumstances may be submitted
              to{" "}
              <a href="mailto:billing@capitalreach.com" className="text-cr-copper hover:underline">
                billing@capitalreach.com
              </a>{" "}
              within 7 days of the charge.
            </p>
          </Section>

          <Section title="5. User Content">
            <p>
              You retain ownership of content you submit to CapitalReach, including startup profiles, pitch materials,
              and messages ("User Content"). By submitting User Content, you grant CapitalReach a worldwide,
              non-exclusive, royalty-free licence to host, display, and distribute that content solely for the
              purpose of operating the Service.
            </p>
            <p className="mt-3">
              You are solely responsible for your User Content and represent that:
            </p>
            <ul className="mt-2 space-y-1.5 list-disc pl-5 text-cr-i3">
              <li>You have the right to submit the content and grant the above licence.</li>
              <li>The content is accurate and not misleading.</li>
              <li>The content does not violate any applicable law or third-party rights.</li>
              <li>Financial information (MRR, funding amounts, traction metrics) is materially accurate.</li>
            </ul>
            <p className="mt-3">
              CapitalReach reserves the right to remove any User Content that violates these Terms or that we determine,
              in our sole discretion, is harmful, misleading, or inappropriate.
            </p>
          </Section>

          <Section title="6. Prohibited Conduct">
            <p>You agree not to:</p>
            <ul className="mt-3 space-y-1.5 list-disc pl-5 text-cr-i3">
              <li>Post false, misleading, or fraudulent information about yourself, your startup, or any investment.</li>
              <li>Use the platform to solicit investments in violation of applicable securities laws.</li>
              <li>Harass, spam, or send unsolicited commercial communications to other users.</li>
              <li>Scrape, crawl, or extract data from the platform using automated means without prior written consent.</li>
              <li>Attempt to circumvent any security measures, access controls, or rate limits.</li>
              <li>Impersonate any person or entity, or misrepresent your affiliation with any person or entity.</li>
              <li>Use the Service for any unlawful purpose or in violation of any applicable regulation.</li>
              <li>Reverse-engineer, decompile, or attempt to extract source code from the platform.</li>
            </ul>
          </Section>

          <Section title="7. Investment Disclaimer">
            <p>
              <strong>CapitalReach is not a registered broker-dealer, investment adviser, or crowdfunding portal
              under the JOBS Act or any other securities regulation.</strong> Nothing on this platform constitutes
              investment advice, a solicitation to buy or sell securities, or a recommendation of any investment.
            </p>
            <p className="mt-3">
              Investing in early-stage startups is highly speculative and involves a substantial risk of loss,
              including the potential loss of your entire investment. Past performance of any startup or investment
              does not guarantee future results. You should consult with a qualified financial adviser before making
              any investment decision.
            </p>
            <p className="mt-3">
              CapitalReach does not verify, endorse, or guarantee the accuracy of information provided by startups or
              investors on the platform. You are solely responsible for conducting your own due diligence.
            </p>
          </Section>

          <Section title="8. AI-Powered Features">
            <p>
              CapitalReach offers AI-generated features including pitch scoring, due diligence reports, and investor
              matching. These outputs are generated by large language models and are provided for informational
              purposes only. They do not constitute investment advice, legal advice, or professional financial
              analysis.
            </p>
            <p className="mt-3">
              AI outputs may contain errors, inaccuracies, or outdated information. You should not rely solely on
              AI-generated content when making business or investment decisions. CapitalReach is not liable for any
              decisions made based on AI-generated outputs.
            </p>
          </Section>

          <Section title="9. Intellectual Property">
            <p>
              The CapitalReach platform, including its design, software, trademarks, and content created by CapitalReach,
              is owned by CapitalReach, Inc. and protected by intellectual property laws. You may not use CapitalReach's
              trademarks, logos, or branding without our prior written consent.
            </p>
            <p className="mt-3">
              Subject to your compliance with these Terms, we grant you a limited, non-exclusive, non-transferable
              licence to access and use the Service for its intended purpose.
            </p>
          </Section>

          <Section title="10. Privacy">
            <p>
              Your use of CapitalReach is also governed by our{" "}
              <Link href="/privacy" className="text-cr-copper hover:underline">Privacy Policy</Link>, which is
              incorporated into these Terms by reference. By using the Service, you consent to the collection and
              use of your information as described in the Privacy Policy.
            </p>
          </Section>

          <Section title="11. Third-Party Services">
            <p>
              CapitalReach integrates with third-party services including Stripe (payments), Supabase (database and
              authentication), and OpenAI (AI features). Your use of these services is subject to their respective
              terms and privacy policies. CapitalReach is not responsible for the practices or content of third-party
              services.
            </p>
          </Section>

          <Section title="12. Disclaimers and Limitation of Liability">
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS
              OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY LAW, VAULTRISE DISCLAIMS ALL WARRANTIES, INCLUDING
              IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p className="mt-3">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, VAULTRISE SHALL NOT BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR
              GOODWILL, ARISING OUT OF OR IN CONNECTION WITH THESE TERMS OR YOUR USE OF THE SERVICE, EVEN IF
              VAULTRISE HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p className="mt-3">
              IN NO EVENT SHALL VAULTRISE'S TOTAL LIABILITY TO YOU EXCEED THE GREATER OF (A) THE AMOUNTS PAID BY
              YOU TO VAULTRISE IN THE 12 MONTHS PRECEDING THE CLAIM OR (B) $100 USD.
            </p>
          </Section>

          <Section title="13. Indemnification">
            <p>
              You agree to indemnify, defend, and hold harmless CapitalReach and its officers, directors, employees,
              and agents from any claims, damages, losses, liabilities, costs, and expenses (including reasonable
              legal fees) arising out of or related to: (a) your use of the Service; (b) your User Content;
              (c) your violation of these Terms; or (d) your violation of any rights of a third party.
            </p>
          </Section>

          <Section title="14. Termination">
            <p>
              We may suspend or terminate your access to the Service at any time, with or without cause, and with
              or without notice. Upon termination, your right to use the Service ceases immediately. Provisions of
              these Terms that by their nature should survive termination will survive, including Sections 5, 7, 9,
              12, 13, and 16.
            </p>
            <p className="mt-3">
              You may terminate your account at any time by contacting us at{" "}
              <a href="mailto:support@capitalreach.com" className="text-cr-copper hover:underline">
                support@capitalreach.com
              </a>{" "}
              or through your account settings.
            </p>
          </Section>

          <Section title="15. Modifications to Terms">
            <p>
              We may update these Terms from time to time. If we make material changes, we will notify you by email
              or by displaying a prominent notice on the platform at least 14 days before the changes take effect.
              Your continued use of the Service after the effective date constitutes acceptance of the updated Terms.
            </p>
          </Section>

          <Section title="16. Governing Law and Dispute Resolution">
            <p>
              These Terms are governed by the laws of the State of Delaware, United States, without regard to its
              conflict-of-law provisions. Any dispute arising from or relating to these Terms or the Service shall
              be resolved through binding arbitration in accordance with the JAMS Streamlined Arbitration Rules,
              except that either party may seek injunctive or other equitable relief in any court of competent
              jurisdiction.
            </p>
            <p className="mt-3">
              You agree to resolve disputes with CapitalReach on an individual basis and waive any right to participate
              in a class action lawsuit or class-wide arbitration.
            </p>
          </Section>

          <Section title="17. Contact">
            <p>
              If you have any questions about these Terms, please contact us at:
            </p>
            <div className="mt-3 bg-cr-paper border border-cr-p4 rounded-xl p-4 text-sm text-cr-i2 space-y-1">
              <p className="font-semibold">CapitalReach, Inc.</p>
              <p>
                Email:{" "}
                <a href="mailto:legal@capitalreach.com" className="text-cr-copper hover:underline">
                  legal@capitalreach.com
                </a>
              </p>
              <p>
                Support:{" "}
                <a href="mailto:support@capitalreach.com" className="text-cr-copper hover:underline">
                  support@capitalreach.com
                </a>
              </p>
            </div>
          </Section>

          <div className="border-t pt-8 text-sm text-cr-i4">
            <p>
              By using CapitalReach, you acknowledge that you have read, understood, and agree to be bound by
              these Terms of Service.
            </p>
          </div>

        </div>
      </main>
      <Footer />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-cr-ink mb-3">{title}</h2>
      <div className="text-cr-i3 leading-relaxed">{children}</div>
    </section>
  );
}
