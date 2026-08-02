import type { Metadata } from "next";

// /blog is a client component, so its metadata lives here — a page marked
// "use client" cannot export the metadata object itself.
export const metadata: Metadata = {
  title: "Blog",
  description: "Notes on early-stage fundraising, investor relations, and building a startup worth backing.",
  alternates: { canonical: "/blog" },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
