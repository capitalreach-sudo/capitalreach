import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { Building2 } from "lucide-react";
import { getLocale, getTranslator } from "@/lib/locale-server";
import { legalEntity, legalEntityConfigured } from "@/lib/brand";

// Impressum / legal notice (§ 5 TMG). Content is env-driven: until the company
// is registered and NEXT_PUBLIC_LEGAL_* are set, the page renders a clear
// "not yet published" state rather than inventing entity details — a wrong
// Impressum is a bigger liability than a pending one.
export const dynamic = "force-static";
export const revalidate = 3600;

export async function generateMetadata() {
  const t = await getTranslator(getLocale());
  return {
    title: t("imprint.metaTitle"),
    description: t("imprint.metaDesc"),
    // Nothing to index until it carries real details.
    ...(legalEntityConfigured ? {} : { robots: { index: false } }),
  };
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-cr-i4 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-cr-ink whitespace-pre-line">{value}</p>
    </div>
  );
}

export default async function ImprintPage() {
  const t = await getTranslator(getLocale());

  return (
    <div className="min-h-screen flex flex-col bg-cr-paper">
      <Navbar />

      <section className="bg-gradient-to-br from-[#0F0C0A] via-[#1A1612] to-slate-900 text-white py-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="w-12 h-12 bg-cr-paper/10 rounded-2xl flex items-center justify-center mx-auto mb-5 backdrop-blur">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold mb-3">{t("imprint.title")}</h1>
          <p className="text-cr-cu-l text-sm">{t("imprint.subtitle")}</p>
        </div>
      </section>

      <section className="py-16 px-4 flex-1">
        <div className="container mx-auto max-w-3xl">
          {legalEntityConfigured ? (
            <div className="bg-cr-paper-2 border border-cr-rule-dark rounded-2xl p-8 space-y-6">
              <Row label={t("imprint.provider")} value={legalEntity.name} />
              <Row label={t("imprint.address")} value={legalEntity.address} />
              <Row label={t("imprint.representedBy")} value={legalEntity.managing} />
              <Row label={t("imprint.contact")} value={[legalEntity.email, legalEntity.phone].filter(Boolean).join("\n")} />
              <Row label={t("imprint.register")} value={legalEntity.register} />
              <Row label={t("imprint.vatId")} value={legalEntity.vatId} />
              <p className="text-xs text-cr-i4 leading-relaxed pt-2 border-t border-cr-rule">
                {t("imprint.euDispute")}
              </p>
            </div>
          ) : (
            <div className="bg-cr-paper-2 border border-cr-rule-dark rounded-2xl p-8 text-center">
              <p className="text-sm font-semibold text-cr-ink mb-2">{t("imprint.pendingTitle")}</p>
              <p className="text-sm text-cr-i3 leading-relaxed max-w-md mx-auto">
                {t("imprint.pendingBody")}
              </p>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
