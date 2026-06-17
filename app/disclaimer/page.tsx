import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { ShieldCheck } from "lucide-react";

export const metadata = {
  title: "Investment Disclaimer",
  description: "Important legal disclosures about investment risk on the CapitalReach platform.",
};

const LAST_UPDATED = "May 1, 2026";

export default function DisclaimerPage() {
  return (
    <div className="min-h-screen flex flex-col bg-cr-paper">
      <Navbar />

      {/* Hero */}
      <section className="bg-gradient-to-br from-[#0F0C0A] via-[#1A1612] to-slate-900 text-white py-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="w-12 h-12 bg-cr-paper/10 rounded-2xl flex items-center justify-center mx-auto mb-5 backdrop-blur">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold mb-3">Investment Disclaimer</h1>
          <p className="text-cr-cu-l text-sm">Last updated: {LAST_UPDATED}</p>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-3xl">
          <div className="prose prose-gray max-w-none space-y-10">

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6">
              <p className="text-sm font-bold text-amber-300 mb-2">Important notice</p>
              <p className="text-sm text-amber-400 leading-relaxed">
                Investing in early-stage private companies involves a high degree of risk. You could lose your entire investment. Please read this disclaimer carefully before using the CapitalReach platform.
              </p>
            </div>

            <section>
              <h2 className="text-xl font-bold text-cr-ink mb-3">1. Not investment advice</h2>
              <p className="text-cr-i3 leading-relaxed text-sm">
                CapitalReach, Inc. ("CapitalReach") is not a registered investment advisor, broker-dealer, or financial planner. The information, materials, and tools available on the CapitalReach platform are provided for informational purposes only and do not constitute investment advice, financial advice, legal advice, or any other type of professional advice. Nothing on this platform should be construed as a recommendation to buy, sell, or hold any security or investment.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-cr-ink mb-3">2. Risk of loss</h2>
              <p className="text-cr-i3 leading-relaxed text-sm mb-3">
                Investments in startups and early-stage companies are speculative and highly risky. You should be prepared to lose your entire investment. Risks include, but are not limited to:
              </p>
              <ul className="list-disc list-inside text-sm text-cr-i3 space-y-1.5 ml-2">
                <li>Business failure — most startups do not succeed</li>
                <li>Illiquidity — there is typically no public market for shares in private companies</li>
                <li>Dilution — future financing rounds may reduce your ownership percentage</li>
                <li>Regulatory risk — changes in law may adversely affect a company's business</li>
                <li>Fraud or misrepresentation — CapitalReach does not guarantee the accuracy of information provided by startups</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-cr-ink mb-3">3. Accredited investors only</h2>
              <p className="text-cr-i3 leading-relaxed text-sm">
                Access to certain investment opportunities on CapitalReach is restricted to "accredited investors" as defined under Rule 501 of Regulation D under the U.S. Securities Act of 1933, or equivalent classifications under applicable law in other jurisdictions. By representing yourself as an accredited investor on our platform, you confirm that you meet the applicable legal standard. CapitalReach reserves the right to request supporting documentation to verify accreditation status.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-cr-ink mb-3">4. No verification of startup information</h2>
              <p className="text-cr-i3 leading-relaxed text-sm">
                CapitalReach does not independently verify the accuracy, completeness, or reliability of any information submitted by startups on our platform, including but not limited to financial projections, cap tables, intellectual property claims, or descriptions of products and services. Investors are solely responsible for conducting their own due diligence prior to making any investment decision.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-cr-ink mb-3">5. Past performance</h2>
              <p className="text-cr-i3 leading-relaxed text-sm">
                Past performance of any investment, portfolio company, or market sector referenced on the CapitalReach platform does not guarantee or predict future results. Any return projections or financial models provided by startups are forward-looking statements and involve significant uncertainty.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-cr-ink mb-3">6. Success fee disclosure</h2>
              <p className="text-cr-i3 leading-relaxed text-sm">
                CapitalReach charges startups a success fee equal to 2% of the total amount raised through introductions facilitated by our platform. This fee is due only upon closing of a financing round. Investors are not charged this fee. The existence of this fee should be considered when evaluating investment terms, as it may affect the effective use of capital raised by a startup.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-cr-ink mb-3">7. Geographic restrictions</h2>
              <p className="text-cr-i3 leading-relaxed text-sm">
                The CapitalReach platform is not available in jurisdictions where its use would violate local laws or regulations. Users are responsible for ensuring their use of the platform complies with all applicable laws in their jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-cr-ink mb-3">8. Contact</h2>
              <p className="text-cr-i3 leading-relaxed text-sm">
                If you have questions about this disclaimer or the CapitalReach platform, please contact us at{" "}
                <a href="mailto:legal@capitalreach.com" className="text-cr-copper hover:underline">legal@capitalreach.com</a>.
              </p>
            </section>

          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
