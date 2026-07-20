import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { getLocale, getTranslator } from "@/lib/locale-server";
import type { Metadata } from "next";
import type { ServerT } from "@/lib/locale-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator(getLocale());
  return {
    title: t("privacy.metaTitle"),
    description: t("privacy.metaDesc"),
  };
}

function Bullet({ t, k }: { t: ServerT; k: string }) {
  const [bold, rest] = t(`privacy.${k}`).split("|||");
  return (
    <li>
      <strong>{bold}</strong> {rest}
    </li>
  );
}

function InlineLink({ t, k, href, label }: { t: ServerT; k: string; href: string; label: string }) {
  const [before, after] = t(`privacy.${k}`).split("{link}");
  return (
    <>
      {before}
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noopener noreferrer" : undefined} className="text-cr-copper hover:underline">
        {label}
      </a>
      {after}
    </>
  );
}

export default async function PrivacyPage() {
  const t = await getTranslator(getLocale());

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-12 max-w-3xl">
        {/* Header */}
        <div className="mb-10">
          <p className="text-sm text-cr-copper font-semibold uppercase tracking-wide mb-2">{t("privacy.legalLabel")}</p>
          <h1 className="text-4xl font-extrabold text-cr-ink mb-3">{t("privacy.title")}</h1>
          <p className="text-cr-i3 text-sm">{t("privacy.effectiveDatePrefix")} {t("privacy.effectiveDate")}</p>
        </div>

        <div className="prose prose-gray max-w-none space-y-8 text-cr-i2 leading-relaxed">

          <section>
            <p>
              <InlineLink t={t} k="introP1" href="https://capitalreach.com" label="capitalreach.com" />
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">{t("privacy.s1Title")}</h2>
            <h3 className="text-base font-semibold text-[#f0f0f0] mb-2">{t("privacy.s1h1")}</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <Bullet t={t} k="s1l1" />
              <Bullet t={t} k="s1l2" />
              <Bullet t={t} k="s1l3" />
              <Bullet t={t} k="s1l4" />
              <Bullet t={t} k="s1l5" />
            </ul>

            <h3 className="text-base font-semibold text-[#f0f0f0] mb-2 mt-4">{t("privacy.s1h2")}</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <Bullet t={t} k="s1l6" />
              <Bullet t={t} k="s1l7" />
              <Bullet t={t} k="s1l8" />
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">{t("privacy.s2Title")}</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>{t("privacy.s2l1")}</li>
              <li>{t("privacy.s2l2")}</li>
              <li>{t("privacy.s2l3")}</li>
              <li>{t("privacy.s2l4")}</li>
              <li>{t("privacy.s2l5")}</li>
              <li><InlineLink t={t} k="s2l6" href="/terms" label={t("privacy.termsOfServiceLabel")} /></li>
              <li>{t("privacy.s2l7")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">{t("privacy.s3Title")}</h2>
            <p className="text-sm mb-3">
              {t("privacy.s3Intro")}
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <Bullet t={t} k="s3l1" />
              <Bullet t={t} k="s3l2" />
              <Bullet t={t} k="s3l3" />
              <Bullet t={t} k="s3l4" />
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">{t("privacy.s4Title")}</h2>
            <p className="text-sm">
              {t("privacy.s4Text")}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">{t("privacy.s5Title")}</h2>
            <p className="text-sm mb-3">{t("privacy.s5Intro")}</p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <Bullet t={t} k="s5l1" />
              <Bullet t={t} k="s5l2" />
              <li><InlineLink t={t} k="s5l3" href="mailto:support@capitalreach.com" label="support@capitalreach.com" /></li>
              <Bullet t={t} k="s5l4" />
              <Bullet t={t} k="s5l5" />
              <Bullet t={t} k="s5l6" />
            </ul>
            <p className="text-sm mt-3">
              <InlineLink t={t} k="s5Footer" href="mailto:support@capitalreach.com" label="support@capitalreach.com" />
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">{t("privacy.s6Title")}</h2>
            <p className="text-sm mb-3">{t("privacy.s6Intro")}</p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <Bullet t={t} k="s6l1" />
              <Bullet t={t} k="s6l2" />
              <Bullet t={t} k="s6l3" />
            </ul>
            <p className="text-sm mt-2">
              {t("privacy.s6Footer")}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">{t("privacy.s7Title")}</h2>
            <p className="text-sm">
              <InlineLink t={t} k="s7Text" href="https://openai.com/enterprise-privacy" label={t("privacy.s7LinkLabel")} />
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">{t("privacy.s8Title")}</h2>
            <p className="text-sm">
              <InlineLink t={t} k="s8Text" href="mailto:support@capitalreach.com" label="support@capitalreach.com" />
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">{t("privacy.s9Title")}</h2>
            <p className="text-sm">
              {t("privacy.s9Text")}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">{t("privacy.s10Title")}</h2>
            <p className="text-sm">
              {t("privacy.s10Text")}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">{t("privacy.s11Title")}</h2>
            <p className="text-sm">
              {t("privacy.s11Text")}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-cr-ink mb-3">{t("privacy.s12Title")}</h2>
            <p className="text-sm">
              {t("privacy.s12Text")}
            </p>
            <div className="mt-3 bg-cr-paper border rounded-xl p-4 text-sm">
              <p className="font-semibold text-cr-ink">CapitalReach</p>
              <p className="text-cr-i3">{t("privacy.contactBoxEmailLabel")} <a href="mailto:support@capitalreach.com" className="text-cr-copper hover:underline">support@capitalreach.com</a></p>
              <p className="text-cr-i3 mt-1">
                <Link href="/contact" className="text-cr-copper hover:underline">{t("privacy.contactFormLink")}</Link>
              </p>
            </div>
          </section>

        </div>

        {/* Footer links */}
        <div className="mt-12 pt-8 border-t flex flex-wrap gap-4 text-sm text-cr-i3">
          <Link href="/terms" className="hover:text-cr-copper">{t("privacy.termsOfServiceLabel")}</Link>
          <Link href="/contact" className="hover:text-cr-copper">{t("privacy.footerContactUs")}</Link>
          <Link href="/" className="hover:text-cr-copper">{t("privacy.footerBackHome")}</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
