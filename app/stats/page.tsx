import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { formatMoney, isCurrencyCode, DEFAULT_CURRENCY } from "@/lib/currency";

/**
 * Public platform statistics. Transparency is a differentiator in private
 * capital: most marketplaces hide their numbers precisely when they are
 * small, which teaches users that visible numbers are marketing. Publishing
 * them small and honest earns the credibility the big numbers will need.
 *
 * Aggregates only — counts and sums, never who. Closed volume is reported
 * per currency rather than fake-converted: summing EUR and USD into one
 * figure with a made-up rate is exactly the kind of number this page exists
 * not to publish (the data centre made the same call).
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Platform statistics",
  description: "CapitalReach in numbers — live listings, investors, deals and closed volume. Updated hourly, aggregates only.",
};

export default async function StatsPage() {
  const admin = createAdminClient();

  const [
    { count: activeListings },
    { count: investors },
    { data: deals },
  ] = await Promise.all([
    admin.from("startups").select("id", { count: "exact", head: true }).eq("status", "active"),
    admin.from("investors").select("id", { count: "exact", head: true }),
    admin.from("deals").select("status, amount, currency, created_at, updated_at"),
  ]);

  const all = deals ?? [];
  const closed = all.filter((d) => d.status === "closed");
  const open = all.filter((d) => d.status !== "closed" && d.status !== "passed");
  const concluded = closed.length + all.filter((d) => d.status === "passed").length;
  const closeRate = concluded > 0 ? Math.round((closed.length / concluded) * 100) : null;

  // Closed volume per currency — never summed across currencies.
  const volume = new Map<string, number>();
  for (const d of closed) {
    const cur = isCurrencyCode(d.currency ?? "") ? (d.currency as string) : DEFAULT_CURRENCY;
    volume.set(cur, (volume.get(cur) ?? 0) + (d.amount ?? 0));
  }

  const tiles: Array<{ label: string; value: string; hint?: string }> = [
    { label: "Active listings", value: String(activeListings ?? 0), hint: "reviewed before going live" },
    { label: "Investors", value: String(investors ?? 0) },
    { label: "Deals in progress", value: String(open.length) },
    { label: "Deals closed", value: String(closed.length) },
    ...(closeRate !== null ? [{ label: "Close rate", value: `${closeRate}%`, hint: "of concluded deals" }] : []),
    ...Array.from(volume.entries()).map(([cur, sum]) => ({
      label: `Closed volume (${cur})`,
      value: formatMoney(sum, cur, { compact: true }),
    })),
  ];

  return (
    <>
      <Navbar />
      <main style={{ background: "var(--cr-paper)", minHeight: "70vh" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto", padding: "56px 24px 80px" }}>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--cr-copper)", marginBottom: "10px" }}>
            CapitalReach in numbers
          </p>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "32px", color: "var(--cr-ink)", marginBottom: "10px" }}>
            Platform statistics
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", maxWidth: "58ch", lineHeight: 1.7, marginBottom: "32px" }}>
            Live from the database, refreshed hourly, aggregates only. We publish these while
            they are small on purpose — numbers you only show once they flatter you are
            marketing, not statistics.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
            {tiles.map((tile) => (
              <div key={tile.label} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "18px" }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
                  {tile.label}
                </p>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "28px", color: "var(--cr-ink)", lineHeight: 1.1 }}>
                  {tile.value}
                </p>
                {tile.hint && (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
                    {tile.hint}
                  </p>
                )}
              </div>
            ))}
          </div>

          {volume.size > 1 && (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "16px", lineHeight: 1.6 }}>
              Closed volume is reported per currency. We don&apos;t convert across currencies —
              a combined figure would depend on an exchange rate we&apos;d have to invent.
            </p>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
