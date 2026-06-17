import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { Users, Target, Zap, Shield, Heart } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description: "Learn about CapitalReach — our mission, team, and why we built the platform.",
};

const VALUES = [
  {
    icon: Target,
    title: "Aligned incentives",
    desc: "We only charge 2% when a deal closes. Your success is our success — no other way to see it.",
  },
  {
    icon: Shield,
    title: "Rigorous curation",
    desc: "Every startup is manually reviewed before going live. We'd rather have fewer, better listings than a crowded directory.",
  },
  {
    icon: Zap,
    title: "AI-first infrastructure",
    desc: "From matching to due diligence, we use AI to remove friction — not to replace human judgment.",
  },
  {
    icon: Heart,
    title: "Founder obsession",
    desc: "We were founders first. We build for the version of ourselves that needed this five years ago.",
  },
];


export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-base">
      <Navbar />

      {/* Hero */}
      <section className="relative bg-cr-paper border-b border-cr-p4 py-20 px-4 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-cr-copper/8 blur-[120px] pointer-events-none" />
        <div className="container mx-auto max-w-3xl text-center relative">
          <div className="w-12 h-12 bg-cr-copper/10 rounded-xl flex items-center justify-center mx-auto mb-5 border border-cr-copper/20">
            <Users className="h-6 w-6 text-cr-copper" />
          </div>
          <h1 className="text-4xl font-extrabold mb-4 text-cr-ink">
            Where capital meets ambition
          </h1>
          <p className="text-cr-i3 text-lg max-w-xl mx-auto leading-relaxed">
            CapitalReach is the private marketplace where vetted early-stage startups connect with serious investors — powered by AI and aligned incentives.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-semibold text-cr-copper uppercase tracking-widest mb-3">Our Mission</p>
              <h2 className="text-3xl font-extrabold text-cr-ink mb-4">
                Fix the broken connection between great ideas and patient capital
              </h2>
              <p className="text-cr-i3 leading-relaxed text-sm">
                Most fundraising is opaque, relationship-dependent, and painfully slow. Great founders with real traction get passed over because they don&apos;t know the right people. Investors miss obvious opportunities because the deal flow is noisy and unfiltered.
              </p>
              <p className="text-cr-i3 leading-relaxed text-sm mt-3">
                CapitalReach solves this by building curated infrastructure: every startup is reviewed, every investor is verified, and AI does the heavy lifting of matching. We make money only when deals close — so our incentives are perfectly aligned with yours.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Success Fee", value: "2%" },
                { label: "Avg Review Time", value: "48h" },
              ].map(stat => (
                <div key={stat.label} className="bg-cr-paper border border-cr-p4 rounded-xl p-5 text-center">
                  <p className="text-3xl font-extrabold text-cr-ink">{stat.value}</p>
                  <p className="text-xs text-cr-i3 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 px-4 bg-cr-paper border-y border-cr-p4">
        <div className="container mx-auto max-w-4xl">
          <p className="text-xs font-semibold text-cr-copper uppercase tracking-widest mb-3 text-center">Our Values</p>
          <h2 className="text-3xl font-extrabold text-cr-ink text-center mb-12">What we believe in</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {VALUES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-cr-p2 border border-cr-p4 rounded-xl p-6 hover:border-cr-i4 transition-colors">
                <div className="w-10 h-10 bg-cr-copper/10 rounded-xl flex items-center justify-center mb-4 border border-cr-copper/20">
                  <Icon className="h-5 w-5 text-cr-copper" />
                </div>
                <h3 className="font-bold text-cr-ink text-base mb-2">{title}</h3>
                <p className="text-sm text-cr-i3 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
