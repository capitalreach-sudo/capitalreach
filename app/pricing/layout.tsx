import type { Metadata } from "next";
import { getLocale, getTranslator } from "@/lib/locale-server";

// /pricing is a client component, so its metadata lives here — a page marked
// "use client" cannot export the metadata object itself.
//
// The description deliberately carries no cohort number: the launch target is
// admin-editable platform_config, and a hardcoded figure here once contradicted
// the headline it linked to.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator(getLocale());
  return {
    title: t("meta.pricingTitle"),
    description: t("meta.pricingDesc"),
    alternates: { canonical: "/pricing" },
  };
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
