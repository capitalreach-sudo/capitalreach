import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { ShieldCheck } from "lucide-react";
import { getLocale, getTranslator } from "@/lib/locale-server";

export async function generateMetadata() {
  const t = await getTranslator(getLocale());
  return {
    title: t("disclaimer.metaTitle"),
    description: t("disclaimer.metaDesc"),
  };
}

export default async function DisclaimerPage() {
  const t = await getTranslator(getLocale());

  return (
    <div className="min-h-screen flex flex-col bg-cr-paper">
      <Navbar />

      {/* Hero */}
      <section className="bg-gradient-to-br from-[#0F0C0A] via-[#1A1612] to-slate-900 text-white py-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="w-12 h-12 bg-cr-paper/10 rounded-2xl flex items-center justify-center mx-auto mb-5 backdrop-blur">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold mb-3">{t("disclaimer.title")}</h1>
          <p className="text-cr-cu-l text-sm">{t("disclaimer.lastUpdatedPrefix")} {t("disclaimer.lastUpdated")}</p>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-3xl">
          <div className="prose prose-gray max-w-none space-y-10">

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6">
              <p className="text-sm font-bold text-amber-300 mb-2">{t("disclaimer.noticeLabel")}</p>
              <p className="text-sm text-amber-400 leading-relaxed">
                {t("disclaimer.noticeText")}
              </p>
            </div>

            <section>
              <h2 className="text-xl font-bold text-cr-ink mb-3">{t("disclaimer.s1Title")}</h2>
              <p className="text-cr-i3 leading-relaxed text-sm">
                {t("disclaimer.s1Text")}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-cr-ink mb-3">{t("disclaimer.s2Title")}</h2>
              <p className="text-cr-i3 leading-relaxed text-sm mb-3">
                {t("disclaimer.s2Intro")}
              </p>
              <ul className="list-disc list-inside text-sm text-cr-i3 space-y-1.5 ml-2">
                <li>{t("disclaimer.s2l1")}</li>
                <li>{t("disclaimer.s2l2")}</li>
                <li>{t("disclaimer.s2l3")}</li>
                <li>{t("disclaimer.s2l4")}</li>
                <li>{t("disclaimer.s2l5")}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-cr-ink mb-3">{t("disclaimer.s3Title")}</h2>
              <p className="text-cr-i3 leading-relaxed text-sm">
                {t("disclaimer.s3Text")}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-cr-ink mb-3">{t("disclaimer.s4Title")}</h2>
              <p className="text-cr-i3 leading-relaxed text-sm">
                {t("disclaimer.s4Text")}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-cr-ink mb-3">{t("disclaimer.s5Title")}</h2>
              <p className="text-cr-i3 leading-relaxed text-sm">
                {t("disclaimer.s5Text")}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-cr-ink mb-3">{t("disclaimer.s6Title")}</h2>
              <p className="text-cr-i3 leading-relaxed text-sm">
                {t("disclaimer.s6Text")}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-cr-ink mb-3">{t("disclaimer.s7Title")}</h2>
              <p className="text-cr-i3 leading-relaxed text-sm">
                {t("disclaimer.s7Text")}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-cr-ink mb-3">{t("disclaimer.s8Title")}</h2>
              <p className="text-cr-i3 leading-relaxed text-sm">
                {t("disclaimer.s8Text").split("{link}")[0]}
                <a href="mailto:legal@capitalreach.com" className="text-cr-copper hover:underline">legal@capitalreach.com</a>
                {t("disclaimer.s8Text").split("{link}")[1]}
              </p>
            </section>

          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
