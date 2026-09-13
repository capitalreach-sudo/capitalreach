import type { Metadata } from "next";
import { getLocale, getTranslator } from "@/lib/locale-server";

// /contact is a client component, so its metadata lives here — a page marked
// "use client" cannot export the metadata object itself.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator(getLocale());
  return {
    title: t("meta.contactTitle"),
    description: t("meta.contactDesc"),
    alternates: { canonical: "/contact" },
  };
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
