import { createAdminClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";

/**
 * Public status page. When something breaks, silence is the worst answer —
 * a user who can see "the database is unreachable" files one calm report; a
 * user staring at a spinner files three angry ones.
 *
 * Honest by construction: every check runs live against the real dependency
 * on each request (force-dynamic, no cache), so this page cannot claim
 * health it did not just witness. If the page itself fails to load, that is
 * itself the answer.
 *
 * The cron heartbeat reads the same system_events the admin panel uses. It
 * is reported as "not yet scheduled" rather than "down" while CRON_SECRET is
 * unset — a job that has never been armed is not an outage.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CheckState = "ok" | "degraded" | "down" | "unscheduled";

async function runChecks(): Promise<Array<{ key: string; label: string; state: CheckState; detail?: string }>> {
  const admin = createAdminClient();

  // Database: a real round trip, tiny on purpose.
  let db: CheckState = "ok";
  const dbStart = Date.now();
  let dbMs = 0;
  try {
    const { error } = await admin.from("startups").select("id", { count: "exact", head: true });
    dbMs = Date.now() - dbStart;
    if (error) db = "down";
    else if (dbMs > 2000) db = "degraded";
  } catch {
    db = "down";
  }

  // Auth: GoTrue's health endpoint. It sits behind Supabase's gateway, which
  // 401s any request without an apikey header -- the first version of this
  // check omitted it and reported auth "Down" on an otherwise healthy stack,
  // which the page itself surfaced within minutes of going live. A status
  // check that cannot distinguish "service down" from "I forgot my key" is
  // worse than none.
  let auth: CheckState = "ok";
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      cache: "no-store",
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) auth = "down";
  } catch {
    auth = "down";
  }

  // Storage: the buckets must exist (they famously did not, once).
  let storage: CheckState = "ok";
  try {
    const { data, error } = await admin.storage.listBuckets();
    if (error) storage = "down";
    else if (!data?.some((b) => b.name === "startup-assets")) storage = "degraded";
  } catch {
    storage = "down";
  }

  // Background jobs: the newest heartbeat, from the same table as /admin.
  let cron: CheckState = "unscheduled";
  let cronDetail: string | undefined;
  try {
    const { data } = await admin
      .from("system_events")
      .select("created_at, level")
      .eq("source", "cron/follow-ups")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      const ageDays = (Date.now() - new Date(data.created_at).getTime()) / 86_400_000;
      cron = data.level === "error" ? "degraded" : ageDays > 2 ? "degraded" : "ok";
      cronDetail = new Date(data.created_at).toISOString().slice(0, 16).replace("T", " ") + " UTC";
    }
  } catch {
    cron = "degraded";
  }

  return [
    { key: "app", label: "Application", state: "ok", detail: "serving this page" },
    { key: "db", label: "Database", state: db, detail: db === "ok" ? `${dbMs} ms` : undefined },
    { key: "auth", label: "Sign-in (auth)", state: auth },
    { key: "storage", label: "File storage", state: storage },
    { key: "cron", label: "Background jobs", state: cron, detail: cronDetail },
  ];
}

const STATE_STYLE: Record<CheckState, { dot: string; label: string }> = {
  ok: { dot: "var(--cr-up)", label: "Operational" },
  degraded: { dot: "var(--cr-copper)", label: "Degraded" },
  down: { dot: "var(--cr-down)", label: "Down" },
  unscheduled: { dot: "var(--cr-ink-4)", label: "Not yet scheduled" },
};

export default async function StatusPage() {
  const checks = await runChecks();
  const worst: CheckState = checks.some((c) => c.state === "down")
    ? "down"
    : checks.some((c) => c.state === "degraded")
      ? "degraded"
      : "ok";

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "70vh" }}>
        <div style={{ maxWidth: "640px", margin: "0 auto", padding: "56px 24px 80px" }}>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--cr-copper)", marginBottom: "10px" }}>
            CapitalReach status
          </p>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "32px", color: "var(--cr-ink)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "12px" }}>
            <span aria-hidden style={{ width: 12, height: 12, borderRadius: "50%", background: STATE_STYLE[worst].dot, flexShrink: 0 }} />
            {worst === "ok" ? "All systems operational" : worst === "degraded" ? "Partial degradation" : "Service disruption"}
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", marginBottom: "28px" }}>
            Checked live at {new Date().toISOString().slice(0, 16).replace("T", " ")} UTC — every row below was tested by loading this page.
          </p>

          <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px" }}>
            {checks.map((c, i) => (
              <div key={c.key} style={{ display: "flex", alignItems: "baseline", gap: "12px", padding: "14px 18px", borderTop: i > 0 ? "1px solid var(--cr-rule)" : "none" }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: STATE_STYLE[c.state].dot, flexShrink: 0, alignSelf: "center" }} />
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "14px", color: "var(--cr-ink)" }}>{c.label}</span>
                {c.detail && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--cr-ink-4)" }}>{c.detail}</span>
                )}
                <span style={{ marginInlineStart: "auto", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: STATE_STYLE[c.state].dot }}>
                  {STATE_STYLE[c.state].label}
                </span>
              </div>
            ))}
          </div>

          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "20px", lineHeight: 1.7 }}>
            Something look wrong that this page says is fine? Write to us via the contact page — a report with a time and what you saw is genuinely useful.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
