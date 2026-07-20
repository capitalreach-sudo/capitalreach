import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { Button } from "@/components/ui/button";
import { Briefcase, MapPin, Clock, Zap, Globe, Handshake } from "lucide-react";
import { getLocale, getTranslator } from "@/lib/locale-server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator(getLocale());
  return {
    title: t("careers.metaTitle"),
    description: t("careers.metaDesc"),
  };
}

export default async function CareersPage() {
  const t = await getTranslator(getLocale());

  const OPENINGS = [
    { title: t("careers.role1Title"), team: t("careers.role1Team"), location: t("careers.role1Location"), type: t("careers.fullTime"), desc: t("careers.role1Desc") },
    { title: t("careers.role2Title"), team: t("careers.role2Team"), location: t("careers.role2Location"), type: t("careers.fullTime"), desc: t("careers.role2Desc") },
    { title: t("careers.role3Title"), team: t("careers.role3Team"), location: t("careers.role3Location"), type: t("careers.fullTime"), desc: t("careers.role3Desc") },
    { title: t("careers.role4Title"), team: t("careers.role4Team"), location: t("careers.role4Location"), type: t("careers.fullTime"), desc: t("careers.role4Desc") },
  ];

  const PERKS = [
    { icon: Globe, title: t("careers.perk1Title"), desc: t("careers.perk1Desc") },
    { icon: Zap, title: t("careers.perk2Title"), desc: t("careers.perk2Desc") },
    { icon: Handshake, title: t("careers.perk3Title"), desc: t("careers.perk3Desc") },
    { icon: Briefcase, title: t("careers.perk4Title"), desc: t("careers.perk4Desc") },
  ];

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
            {t("careers.heroLine1")}<br />
            <span className="bg-gradient-to-r from-cr-cu-l to-emerald-400 bg-clip-text text-transparent">
              {t("careers.heroLine2")}
            </span>
          </h1>
          <p className="text-cr-i3 text-lg max-w-xl mx-auto">
            {t("careers.heroSub")}
          </p>
        </div>
      </section>

      {/* Perks */}
      <section className="py-20 px-4 bg-cr-paper border-b border-cr-p4">
        <div className="container mx-auto max-w-4xl">
          <p className="text-xs font-semibold text-cr-copper uppercase tracking-widest mb-3 text-center">{t("careers.whyLabel")}</p>
          <h2 className="text-2xl font-extrabold text-cr-ink mb-10 text-center">{t("careers.whyTitle")}</h2>
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
          <p className="text-xs font-semibold text-cr-copper uppercase tracking-widest mb-3">{t("careers.openRolesLabel")}</p>
          <h2 className="text-2xl font-extrabold text-cr-ink mb-2">{t("careers.hiringTitle")}</h2>
          <p className="text-cr-i3 mb-10 text-sm">{t("careers.hiringSub")}</p>

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
                    {t("careers.applyNow")}
                  </Button>
                </a>
              </div>
            ))}
          </div>

          <div className="mt-12 bg-cr-copper/5 border border-cr-copper/15 rounded-xl p-8 text-center">
            <h3 className="font-bold text-cr-ink text-lg mb-2">{t("careers.noRoleTitle")}</h3>
            <p className="text-sm text-cr-i3 mb-5 max-w-md mx-auto">
              {t("careers.noRoleDesc")}
            </p>
            <a href="mailto:careers@capitalreach.com">
              <Button className="bg-cr-copper hover:bg-cr-cu-l text-white">{t("careers.getInTouch")}</Button>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
