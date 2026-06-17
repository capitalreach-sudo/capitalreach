import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { Button } from "@/components/ui/button";
import { Briefcase, MapPin, Clock, Zap, Globe, Handshake } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Careers",
  description: "Join CapitalReach and help build the future of startup investing.",
};

const OPENINGS = [
  {
    title: "Senior Full-Stack Engineer",
    team: "Engineering",
    location: "Remote (US / EU)",
    type: "Full-time",
    desc: "Own end-to-end features on our Next.js + Supabase stack. Help us scale to thousands of transactions per day.",
  },
  {
    title: "Investor Success Manager",
    team: "Growth",
    location: "New York, NY",
    type: "Full-time",
    desc: "Onboard, support, and grow relationships with our institutional investor members. Own NPS and retention.",
  },
  {
    title: "Startup Partnerships Lead",
    team: "BD & Partnerships",
    location: "San Francisco, CA",
    type: "Full-time",
    desc: "Build and manage relationships with startup ecosystems, accelerators, and VC scouts to grow deal flow.",
  },
  {
    title: "AI / ML Engineer",
    team: "Engineering",
    location: "Remote",
    type: "Full-time",
    desc: "Build the matching algorithms and AI due diligence features that make CapitalReach smarter every day.",
  },
];

const PERKS = [
  { icon: Globe, title: "Remote-first", desc: "Work from anywhere. We have team members across 8 countries." },
  { icon: Zap, title: "Equity", desc: "Meaningful ownership in a company that's changing how capital moves." },
  { icon: Handshake, title: "Aligned incentives", desc: "Your success is tied to the platform's success — just like our fee model." },
  { icon: Briefcase, title: "High ownership", desc: "Small team, big problems. You'll own entire product areas from day one." },
];

export default function CareersPage() {
  return (
    <div className="min-h-screen flex flex-col bg-base">
      <Navbar />

      {/* Hero */}
      <section className="relative bg-cr-paper border-b border-cr-p4 py-24 px-4 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-cr-copper/8 blur-[130px] pointer-events-none" />
        <div className="container mx-auto max-w-3xl text-center relative">
          <div className="w-12 h-12 bg-cr-copper/10 rounded-xl flex items-center justify-center mx-auto mb-5 border border-cr-copper/20">
            <Briefcase className="h-6 w-6 text-cr-copper" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 text-cr-ink">
            Build the future of<br />
            <span className="bg-gradient-to-r from-cr-cu-l to-emerald-400 bg-clip-text text-transparent">
              startup investing
            </span>
          </h1>
          <p className="text-cr-i3 text-lg max-w-xl mx-auto">
            We&apos;re a small, high-conviction team. If you want to move fast and own your work, you&apos;ll fit right in.
          </p>
        </div>
      </section>

      {/* Perks */}
      <section className="py-20 px-4 bg-cr-paper border-b border-cr-p4">
        <div className="container mx-auto max-w-4xl">
          <p className="text-xs font-semibold text-cr-copper uppercase tracking-widest mb-3 text-center">Why CapitalReach</p>
          <h2 className="text-2xl font-extrabold text-cr-ink mb-10 text-center">What sets us apart</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PERKS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-cr-p2 rounded-xl p-5 border border-cr-p4 text-center hover:border-cr-i4 transition-colors">
                <div className="w-10 h-10 bg-cr-copper/10 rounded-xl flex items-center justify-center mx-auto mb-3 border border-cr-copper/20">
                  <Icon className="h-5 w-5 text-cr-copper" />
                </div>
                <h3 className="font-bold text-cr-ink text-sm mb-1">{title}</h3>
                <p className="text-xs text-cr-i3 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open roles */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <p className="text-xs font-semibold text-cr-copper uppercase tracking-widest mb-3">Open Roles</p>
          <h2 className="text-2xl font-extrabold text-cr-ink mb-2">We&apos;re hiring</h2>
          <p className="text-cr-i3 mb-10 text-sm">Across engineering, growth, and partnerships.</p>

          <div className="space-y-4">
            {OPENINGS.map(role => (
              <div
                key={role.title}
                className="bg-cr-paper border border-cr-p4 rounded-xl p-6 hover:border-cr-i4 transition-all flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-bold text-cr-ink">{role.title}</h3>
                    <span className="text-xs font-medium text-cr-copper bg-cr-copper/10 border border-cr-copper/20 px-2 py-0.5 rounded-full">
                      {role.team}
                    </span>
                  </div>
                  <p className="text-sm text-cr-i3 mb-2">{role.desc}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-cr-i4">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {role.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {role.type}
                    </span>
                  </div>
                </div>
                <a href={`mailto:careers@capitalreach.com?subject=Application: ${role.title}`}>
                  <Button size="sm" variant="outline" className="flex-shrink-0 border-cr-p4 text-cr-i2 hover:text-cr-ink hover:bg-cr-paper/5">
                    Apply now
                  </Button>
                </a>
              </div>
            ))}
          </div>

          <div className="mt-12 bg-cr-copper/5 border border-cr-copper/15 rounded-xl p-8 text-center">
            <h3 className="font-bold text-cr-ink text-lg mb-2">Don&apos;t see your role?</h3>
            <p className="text-sm text-cr-i3 mb-5 max-w-md mx-auto">
              We&apos;re always looking for exceptional people. Send us a note and tell us how you&apos;d contribute.
            </p>
            <a href="mailto:careers@capitalreach.com">
              <Button className="bg-cr-copper hover:bg-cr-cu-l text-white">Get in touch</Button>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
