import type { Metadata } from "next";

// Covers every dashboard surface (several are client components that cannot
// declare metadata themselves). Private product pages — never indexed.
export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
