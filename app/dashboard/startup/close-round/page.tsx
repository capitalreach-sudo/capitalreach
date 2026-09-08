import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { ClosureDeclaration } from "@/components/startup/closure-declaration";
import { getLocale, getTranslator } from "@/lib/locale-server";

/**
 * Where a founder declares how their round ended.
 *
 * This is the moment the platform's fee either gets claimed or quietly
 * leaks, so it deserves its own address rather than a modal that can be
 * dismissed by clicking beside it. Server component: the bounce happens
 * before anything renders, and the route behind the form re-checks
 * ownership on its own -- neither check trusts the other.
 */
export default async function CloseRoundPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirect=/dashboard/startup/close-round");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "startup") {
    redirect(profile?.role === "admin" ? "/admin" : "/dashboard/investor");
  }

  const t = await getTranslator(getLocale());

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "70vh" }}>
        <div style={{ maxWidth: "820px", margin: "0 auto", padding: "48px 24px 96px" }}>
          <Link
            href="/dashboard/startup"
            style={{
              display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "40px",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
              color: "var(--cr-ink-4)", textDecoration: "none", marginBottom: "24px",
            }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} /> {t("common.back")}
          </Link>
          <ClosureDeclaration />
        </div>
      </main>
      <Footer />
    </>
  );
}
