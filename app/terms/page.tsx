import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { TrendingUp } from "lucide-react";
import { getLocale, getTranslator } from "@/lib/locale-server";
import type { ServerT } from "@/lib/locale-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator(getLocale());
  return {
    title: t("terms.metaTitle"),
    description: t("terms.metaDesc"),
  };
}

function Bullet({ t, k }: { t: ServerT; k: string }) {
  const raw = t(`terms.${k}`);
  if (!raw.includes("|||")) return <li>{raw}</li>;
  const [bold, rest] = raw.split("|||");
  return (
    <li>
      <strong>{bold}</strong> {rest}
    </li>
  );
}

function InlineLink({ t, k, href, label }: { t: ServerT; k: string; href: string; label: string }) {
  const [before, after] = t(`terms.${k}`).split("{link}");
  return (
    <>
      {before}
      <a href={href} className="text-cr-copper hover:underline">
        {label}
      </a>
      {after}
    </>
  );
}

export default async function TermsPage() {
  const t = await getTranslator(getLocale());

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-16 max-w-3xl">
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-cr-cu-d rounded-lg flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <span className="text-sm font-medium text-cr-copper">{t("terms.brandLabel")}</span>
          </div>
          <h1 className="text-4xl font-bold text-cr-ink mb-3">{t("terms.title")}</h1>
          <p className="text-sm text-cr-i4">{t("terms.lastUpdatedPrefix")} {t("terms.lastUpdated")}</p>
        </div>

        <div className="prose prose-gray max-w-none space-y-8">

          <section>
            <p className="text-cr-i3 leading-relaxed">
              {t("terms.introText")}
            </p>
          </section>

          <Section title={t("terms.s1Title")}>
            <p>{t("terms.s1p1")}</p>
            <p className="mt-3">{t("terms.s1p2")}</p>
          </Section>

          <Section title={t("terms.s2Title")}>
            <p>{t("terms.s2p1")}</p>
            <ul className="mt-3 space-y-1.5 list-disc pl-5 text-cr-i3">
              <Bullet t={t} k="s2l1" />
              <Bullet t={t} k="s2l2" />
              <Bullet t={t} k="s2l3" />
              <Bullet t={t} k="s2l4" />
            </ul>
            <p className="mt-3">{t("terms.s2p2")}</p>
          </Section>

          <Section title={t("terms.s3Title")}>
            <p>
              <InlineLink t={t} k="s3p1" href="mailto:support@capitalreach.com" label="support@capitalreach.com" />
            </p>
            <p className="mt-3">{t("terms.s3p2")}</p>
          </Section>

          <Section title={t("terms.s4Title")}>
            <p>{t("terms.s4p1")}</p>

            <h3 className="font-semibold text-cr-ink mt-4 mb-2">{t("terms.s4h1")}</h3>
            <p>
              <InlineLink t={t} k="s4h1p1" href="/pricing" label={t("pricing.title")} />
            </p>

            <h3 className="font-semibold text-cr-ink mt-4 mb-2">{t("terms.s4h2")}</h3>
            <p>{t("terms.s4h2p1")}</p>

            <h3 className="font-semibold text-cr-ink mt-4 mb-2">{t("terms.s4h3")}</h3>
            <p>
              <InlineLink t={t} k="s4h3p1" href="mailto:billing@capitalreach.com" label="billing@capitalreach.com" />
            </p>
          </Section>

          <Section title={t("terms.s5Title")}>
            <p>{t("terms.s5p1")}</p>
            <p className="mt-3">{t("terms.s5p2")}</p>
            <ul className="mt-2 space-y-1.5 list-disc pl-5 text-cr-i3">
              <li>{t("terms.s5l1")}</li>
              <li>{t("terms.s5l2")}</li>
              <li>{t("terms.s5l3")}</li>
              <li>{t("terms.s5l4")}</li>
            </ul>
            <p className="mt-3">{t("terms.s5p3")}</p>
          </Section>

          <Section title={t("terms.s6Title")}>
            <p>{t("terms.s6p1")}</p>
            <ul className="mt-3 space-y-1.5 list-disc pl-5 text-cr-i3">
              <li>{t("terms.s6l1")}</li>
              <li>{t("terms.s6l2")}</li>
              <li>{t("terms.s6l3")}</li>
              <li>{t("terms.s6l4")}</li>
              <li>{t("terms.s6l5")}</li>
              <li>{t("terms.s6l6")}</li>
              <li>{t("terms.s6l7")}</li>
              <li>{t("terms.s6l8")}</li>
            </ul>
          </Section>

          <Section title={t("terms.s7Title")}>
            <p>
              <strong>{t("terms.s7p1Bold")}</strong> {t("terms.s7p1Rest")}
            </p>
            <p className="mt-3">{t("terms.s7p2")}</p>
            <p className="mt-3">{t("terms.s7p3")}</p>
          </Section>

          <Section title={t("terms.s8Title")}>
            <p>{t("terms.s8p1")}</p>
            <p className="mt-3">{t("terms.s8p2")}</p>
          </Section>

          <Section title={t("terms.s9Title")}>
            <p>{t("terms.s9p1")}</p>
            <p className="mt-3">{t("terms.s9p2")}</p>
          </Section>

          <Section title={t("terms.s10Title")}>
            <p>
              <InlineLink t={t} k="s10p1" href="/privacy" label={t("privacy.title")} />
            </p>
          </Section>

          <Section title={t("terms.s11Title")}>
            <p>{t("terms.s11p1")}</p>
          </Section>

          <Section title={t("terms.s12Title")}>
            <p>{t("terms.s12p1")}</p>
            <p className="mt-3">{t("terms.s12p2")}</p>
            <p className="mt-3">{t("terms.s12p3")}</p>
          </Section>

          <Section title={t("terms.s13Title")}>
            <p>{t("terms.s13p1")}</p>
          </Section>

          <Section title={t("terms.s14Title")}>
            <p>{t("terms.s14p1")}</p>
            <p className="mt-3">
              <InlineLink t={t} k="s14p2" href="mailto:support@capitalreach.com" label="support@capitalreach.com" />
            </p>
          </Section>

          <Section title={t("terms.s15Title")}>
            <p>{t("terms.s15p1")}</p>
          </Section>

          <Section title={t("terms.s16Title")}>
            <p>{t("terms.s16p1")}</p>
            <p className="mt-3">{t("terms.s16p2")}</p>
          </Section>

          <Section title={t("terms.s17Title")}>
            <p>{t("terms.s17p1")}</p>
            <div className="mt-3 bg-cr-paper border border-cr-p4 rounded-xl p-4 text-sm text-cr-i2 space-y-1">
              <p className="font-semibold">{t("terms.contactBrand")}</p>
              <p>
                {t("terms.emailLabel")}{" "}
                <a href="mailto:legal@capitalreach.com" className="text-cr-copper hover:underline">
                  legal@capitalreach.com
                </a>
              </p>
              <p>
                {t("terms.supportLabel")}{" "}
                <a href="mailto:support@capitalreach.com" className="text-cr-copper hover:underline">
                  support@capitalreach.com
                </a>
              </p>
            </div>
          </Section>

          <div className="border-t pt-8 text-sm text-cr-i4">
            <p>
              {t("terms.footerAck")}
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
