import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/shared/navbar";
import { AdminUsersClient } from "@/components/admin/admin-users-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "User Management — CapitalReach Admin",
  robots: { index: false, follow: false },
};

export default async function AdminUsersPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirect=/admin/users");

  // Middleware guards /admin, but this page can suspend accounts — re-check the
  // role here against the service-role client rather than trusting the session.
  const admin = createAdminClient();
  const { data: me } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "admin") redirect("/dashboard");

  const { data: users } = await admin
    .from("profiles")
    .select("id, email, full_name, role, subscription_tier, account_status, suspended, suspended_reason, suspended_at, suspended_until, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "80vh" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "100px 24px 64px" }}>
          <div className="ruled-label" style={{ marginBottom: "16px" }}>Admin</div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700,
            fontSize: "clamp(28px,4vw,44px)", color: "var(--cr-ink)",
            letterSpacing: "-0.02em", marginBottom: "8px",
          }}>
            User management
          </h1>
          <p style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px",
            color: "var(--cr-ink-4)", marginBottom: "32px",
          }}>
            {users?.length ?? 0} accounts. Suspension takes effect immediately and signs the user out.
          </p>

          <AdminUsersClient users={users ?? []} currentAdminId={user.id} />
        </div>
      </main>
    </>
  );
}
