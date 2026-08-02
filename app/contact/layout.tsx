import type { Metadata } from "next";

// /contact is a client component, so its metadata lives here — a page marked
// "use client" cannot export the metadata object itself.
export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the CapitalReach team about listings, investor access, or institutional enquiries.",
  alternates: { canonical: "/contact" },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
