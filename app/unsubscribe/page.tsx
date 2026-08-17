import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { createAdminClient } from "@/lib/supabase-server";
import { getLocale, getTranslator } from "@/lib/locale-server";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * One-click email unsubscribe. Reached from the footer of every email with a
 * per-user token, so it works without a login (the CAN-SPAM / GDPR
 * expectation). Sets a global email opt-out; in-app notifications are
 * unaffected and per-type preferences stay in Settings.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams?: { token?: string } }) {
  const t = await getTranslator(getLocale());
  const token = searchParams?.token;
  let state: "ok" | "invalid" = "invalid";

  if (token && /^[0-9a-f-]{36}$/i.test(token)) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .update({ email_opt_out: true })
      .eq("unsubscribe_token", token)
      .select("id")
      .maybeSingle();
    if (data) state = "ok";
  }

  return (
    <div className="min-h-screen flex flex-col bg-cr-paper">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 py-24">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-extrabold text-cr-ink mb-3">
            {state === "ok" ? t("unsubscribe.doneTitle") : t("unsubscribe.invalidTitle")}
          </h1>
          <p className="text-cr-i3 text-sm leading-relaxed mb-6">
            {state === "ok" ? t("unsubscribe.doneBody") : t("unsubscribe.invalidBody")}
          </p>
          <Link href="/dashboard/settings" className="text-cr-copper text-sm font-medium hover:underline">
            {t("unsubscribe.manage")} →
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
