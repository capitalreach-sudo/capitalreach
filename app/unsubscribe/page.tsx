import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { createAdminClient } from "@/lib/supabase-server";
import { getLocale, getTranslator } from "@/lib/locale-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };
export const dynamic = "force-dynamic";

const TOKEN_RE = /^[0-9a-f-]{36}$/i;

/**
 * Email unsubscribe: CONFIRM, then opt out. Reached from the footer of every
 * email with a per-user token, so it works without a login (the CAN-SPAM /
 * GDPR expectation). Sets a global email opt-out; in-app notifications are
 * unaffected and per-type preferences stay in Settings.
 *
 * The write happens on POST, never on GET: corporate mail scanners and
 * link-preview prefetchers fetch email links routinely, and the old
 * opt-out-on-render silently unsubscribed anyone whose mail server looked at
 * the message. (When mail goes live, pair this with the RFC 8058
 * List-Unsubscribe-Post header for true one-click clients.)
 */
export default async function UnsubscribePage({ searchParams }: { searchParams?: { token?: string; done?: string } }) {
  const t = await getTranslator(getLocale());
  const token = searchParams?.token;
  const validToken = !!token && TOKEN_RE.test(token);
  const state: "confirm" | "ok" | "invalid" =
    searchParams?.done === "1" ? "ok" : validToken ? "confirm" : "invalid";

  async function confirmOptOut(formData: FormData) {
    "use server";
    const tok = String(formData.get("token") ?? "");
    if (!TOKEN_RE.test(tok)) redirect("/unsubscribe");
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .update({ email_opt_out: true })
      .eq("unsubscribe_token", tok)
      .select("id")
      .maybeSingle();
    redirect(data ? "/unsubscribe?done=1" : "/unsubscribe");
  }

  return (
    <div className="min-h-screen flex flex-col bg-cr-paper">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 py-24">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-extrabold text-cr-ink mb-3">
            {state === "ok" ? t("unsubscribe.doneTitle")
              : state === "confirm" ? t("unsubscribe.confirmTitle")
              : t("unsubscribe.invalidTitle")}
          </h1>
          <p className="text-cr-i3 text-sm leading-relaxed mb-6">
            {state === "ok" ? t("unsubscribe.doneBody")
              : state === "confirm" ? t("unsubscribe.confirmBody")
              : t("unsubscribe.invalidBody")}
          </p>
          {state === "confirm" && (
            <form action={confirmOptOut} className="mb-6">
              <input type="hidden" name="token" value={token} />
              <button type="submit"
                className="inline-flex items-center justify-center rounded-full bg-cr-copper text-cr-band-ink font-semibold text-sm px-6 h-11">
                {t("unsubscribe.confirmButton")}
              </button>
            </form>
          )}
          <Link href="/dashboard/settings" className="text-cr-copper text-sm font-medium hover:underline">
            {t("unsubscribe.manage")} →
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
