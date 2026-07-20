import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { Users, Target, Zap, Shield, Heart } from "lucide-react";
import { getLocale, getTranslator } from "@/lib/locale-server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator(getLocale());
  return {
    title: t("about.metaTitle"),
    description: t("about.metaDesc"),
  };
}

export default async function AboutPage() {
  const t = await getTranslator(getLocale());

  const VALUES = [
    { icon: Target, title: t("about.v1Title"), desc: t("about.v1Desc") },
    { icon: Shield, title: t("about.v2Title"), desc: t("about.v2Desc") },
    { icon: Zap,    title: t("about.v3Title"), desc: t("about.v3Desc") },
    { icon: Heart,  title: t("about.v4Title"), desc: t("about.v4Desc") },
  ];

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
            {t("about.heroTitle")}
          </h1>
          <p className="text-cr-i3 text-lg max-w-xl mx-auto leading-relaxed">
            {t("about.heroSub")}
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-semibold text-cr-copper uppercase tracking-widest mb-3">{t("about.missionLabel")}</p>
              <h2 className="text-3xl font-extrabold text-cr-ink mb-4">
                {t("about.missionTitle")}
              </h2>
              <p className="text-cr-i3 leading-relaxed text-sm">
                {t("about.missionP1")}
              </p>
              <p className="text-cr-i3 leading-relaxed text-sm mt-3">
                {t("about.missionP2")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: t("about.statSuccessFee"), value: "2%" },
                { label: t("about.statAvgReview"), value: "48h" },
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
          <p className="text-xs font-semibold text-cr-copper uppercase tracking-widest mb-3 text-center">{t("about.valuesLabel")}</p>
          <h2 className="text-3xl font-extrabold text-cr-ink text-center mb-12">{t("about.valuesTitle")}</h2>
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
