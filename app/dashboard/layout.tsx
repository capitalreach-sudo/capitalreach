import type { Metadata } from "next";
import { Suspense } from "react";
import { TermsReconsentBar } from "@/components/shared/terms-reconsent-bar";
import { WelcomeModal } from "@/components/ui/WelcomeModal";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// Covers every dashboard surface (several are client components that cannot
// declare metadata themselves). Private product pages — never indexed.
export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Role for the one-time welcome (opens only with ?welcome=1 after
  // onboarding). Read here once rather than in each dashboard page.
  let role: "startup" | "investor" | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (p?.role === "startup" || p?.role === "investor") role = p.role;
    }
  } catch { /* layout must never fail on this */ }

  return (
    <>
      <TermsReconsentBar />
      {role && (
        <Suspense fallback={null}>
          <WelcomeModal role={role} />
        </Suspense>
      )}
      {children}
    </>
  );
}
