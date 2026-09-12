"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CountUp } from "@/components/ui/count-up";
import { useTranslation } from "@/hooks/useTranslation";
import { safeFormatTotal } from "@/lib/validators";

/**
 * "Who's waiting for you", as an instrument rather than a form: dial in a
 * stage and a sector and the readout answers -- how many live investors
 * declare appetite for exactly that round, the same aggregate the
 * directory's filters expose. Readings are cached per session, so flipping
 * back to a combination answers with no round trip. The one next action
 * carries the dialed-in pair to /startups with the filters already applied.
 *
 * Server-data honest: a failed read says so in place of a figure -- never a
 * stale figure for a different selection -- and the endpoint's optional
 * listing-side aggregates (`listings`, `raising`) render only when the
 * server actually sent them, so the readout cannot claim numbers it does
 * not have.
 */
const STAGES = [
  { value: "pre-seed", label: "Pre-Seed" },
  { value: "seed", label: "Seed" },
  { value: "series_a", label: "Series A" },
  { value: "series_b_plus", label: "Series B+" },
];
// Every entry is a member of the directory's INDUSTRIES list, verbatim: the
// CTA hands these strings to /startups?industries=, and a label the filter
// does not know would land the reader on an empty page.
const INDUSTRIES = ["B2B SaaS", "FinTech", "HealthTech", "AI / Machine Learning", "Consumer", "Marketplace"];

const CHIP: React.CSSProperties = {
  border: "1px solid var(--cr-rule-dark)", background: "transparent", borderRadius: "999px",
  padding: "8px 16px", minHeight: "40px", cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-3)",
  transition: "color 120ms ease, border-color 120ms ease",
};
// Engaged position reads in ink, not copper: the readout figure is this
// view's one accent, and two lit chips beside it would already be three.
const CHIP_ON: React.CSSProperties = {
  ...CHIP, border: "1px solid var(--cr-ink)", color: "var(--cr-ink)", fontWeight: 600,
};

const MICRO_LABEL: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "10px",
  letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cr-ink-4)",
};

type MatchReading = {
  count: number;
  total: number;
  listings?: number;
  raising?: number;
};

/** Non-negative finite number or null -- the API is trusted to be JSON, not to be well formed. */
function nat(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

function parseReading(d: unknown): MatchReading | null {
  if (typeof d !== "object" || d === null) return null;
  const o = d as Record<string, unknown>;
  const count = nat(o.count);
  const total = nat(o.total);
  if (count === null || total === null) return null;
  const listings = nat(o.listings);
  const raising = nat(o.raising);
  return {
    count, total,
    ...(listings !== null ? { listings } : {}),
    ...(raising !== null ? { raising } : {}),
  };
}

export function MarketMatcher() {
  const { t } = useTranslation();
  const tf = (key: string, fallback: string) => {
    const out = t(key);
    return out === key ? fallback : out;
  };

  const [stage, setStage] = useState("seed");
  const [industry, setIndustry] = useState("B2B SaaS");
  const [reading, setReading] = useState<MatchReading | null>(null);
  const [failed, setFailed] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Session memo: a combination already read answers instantly, which is what
  // makes flipping between chips feel like a dial and not a request queue.
  const cache = useRef<Map<string, MatchReading>>(new Map());

  useEffect(() => {
    const key = `${stage}|${industry}`;
    const hit = cache.current.get(key);
    if (hit) {
      setReading(hit); setFailed(false); setInFlight(false);
      return;
    }
    const ctl = new AbortController();
    let alive = true;
    setInFlight(true);
    fetch(`/api/market/match?stage=${encodeURIComponent(stage)}&industry=${encodeURIComponent(industry)}`, { signal: ctl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`match ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        const parsed = parseReading(d);
        if (parsed) {
          cache.current.set(key, parsed);
          setReading(parsed); setFailed(false);
        } else {
          // A malformed payload is a failed read, not a zero.
          setReading(null); setFailed(true);
        }
        setInFlight(false);
      })
      .catch((e) => {
        if (!alive || (e instanceof DOMException && e.name === "AbortError")) return;
        setReading(null); setFailed(true); setInFlight(false);
      });
    return () => { alive = false; ctl.abort(); };
  }, [stage, industry, attempt]);

  const stageLabel = STAGES.find((s) => s.value === stage)?.label ?? stage;
  const directoryHref = `/startups?stages=${encodeURIComponent(stage)}&industries=${encodeURIComponent(industry)}`;

  return (
    <section aria-label={t("match.title")} style={{ background: "var(--cr-paper)", borderTop: "1px solid var(--cr-rule)" }}>
      <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-16 md:py-24 grid lg:grid-cols-2 gap-12 items-center">

        {/* ── The controls ── */}
        <div>
          <div className="ruled-label" style={{ marginBottom: "16px" }}>{t("match.title")}</div>
          <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(22px, 3vw, 28px)", color: "var(--cr-ink)", letterSpacing: "-0.01em", marginBottom: "8px" }}>
            {t("match.hint")}
          </h2>

          <div style={{ marginTop: "24px" }}>
            <div id="match-stage-label" style={MICRO_LABEL}>{tf("match.stage", "Stage")}</div>
            <div role="group" aria-labelledby="match-stage-label" style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
              {STAGES.map((s) => (
                <button key={s.value} onClick={() => setStage(s.value)} aria-pressed={stage === s.value}
                  style={stage === s.value ? CHIP_ON : CHIP}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: "16px" }}>
            <div id="match-sector-label" style={MICRO_LABEL}>{tf("match.sector", "Sector")}</div>
            <div role="group" aria-labelledby="match-sector-label" style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
              {INDUSTRIES.map((ind) => (
                <button key={ind} onClick={() => setIndustry(ind)} aria-pressed={industry === ind}
                  style={industry === ind ? CHIP_ON : CHIP}>
                  {ind}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── The readout ── */}
        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px 16px", borderBottom: "1px solid var(--cr-rule)" }}>
            <span style={MICRO_LABEL}>{tf("match.readout", "Live readout")}</span>
            {/* The selection echoed back in the mono voice: the instrument
                confirms what is dialed in before it answers. */}
            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--cr-ink-4)", textAlign: "end" }}>
              {reading !== null && !failed && (
                <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cr-copper)", display: "inline-block", flexShrink: 0 }} aria-hidden />
              )}
              {stageLabel} · {industry}
            </span>
          </div>

          {/* Screen readers hear the settled figure, not 40 animation frames. */}
          <span className="sr-only" role="status">
            {failed
              ? tf("match.unavailable", "Live figures are unavailable right now.")
              : reading !== null
                ? `${reading.count} ${t("match.result", { total: reading.total })}`
                : ""}
          </span>

          {failed ? (
            /* The honest empty state: no figure, said plainly, retryable. The
               CTA below stays -- the directory works even when the count reads
               do not. */
            <div style={{ padding: "24px", minHeight: "172px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", textAlign: "center" }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", margin: 0, maxWidth: "36ch", lineHeight: 1.6 }}>
                {tf("match.unavailable", "Live figures are unavailable right now.")}
              </p>
              <button
                onClick={() => setAttempt((n) => n + 1)}
                style={{ background: "transparent", border: "none", padding: "4px 8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink-2)", textDecoration: "underline", textUnderlineOffset: "4px" }}
              >
                {tf("match.retry", "Try again")}
              </button>
            </div>
          ) : (
            <div
              aria-hidden
              style={{ padding: "24px", minHeight: "172px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", opacity: inFlight ? 0.55 : 1, transition: "opacity 150ms ease" }}
            >
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "clamp(56px, 9vw, 92px)", color: "var(--cr-copper)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {reading !== null ? <CountUp value={reading.count} /> : <span style={{ color: "var(--cr-ink-4)", fontSize: "32px" }}>···</span>}
              </div>
              {reading !== null && reading.total > 0 && (
                /* Demand gauge: this combination's share of every live
                   investor. Same two numbers as the sentence below, drawn. */
                <div style={{ width: "min(240px, 80%)", height: "2px", background: "var(--cr-rule-dark)", marginTop: "16px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", insetInlineStart: 0, top: 0, bottom: 0, width: `${Math.max(reading.count > 0 ? 2 : 0, Math.min(100, (reading.count / reading.total) * 100))}%`, background: "var(--cr-copper)", transition: "width 400ms ease" }} />
                </div>
              )}
              {reading !== null && (
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", marginTop: "12px", marginBottom: 0 }}>
                  {t("match.result", { total: reading.total })}
                </p>
              )}
            </div>
          )}

          {reading !== null && (reading.listings !== undefined || reading.raising !== undefined) && (
            <div style={{ display: "grid", gridTemplateColumns: reading.listings !== undefined && reading.raising !== undefined ? "1fr 1fr" : "1fr", gap: "1px", background: "var(--cr-rule)", borderTop: "1px solid var(--cr-rule)" }}>
              {reading.listings !== undefined && (
                <div style={{ background: "var(--cr-paper-2)", padding: "12px 16px", textAlign: "center" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                    <CountUp value={reading.listings} />
                  </div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "8px" }}>
                    {tf("match.openRounds", "Open rounds")}
                  </div>
                </div>
              )}
              {reading.raising !== undefined && (
                <div style={{ background: "var(--cr-paper-2)", padding: "12px 16px", textAlign: "center" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                    {safeFormatTotal(reading.raising)}
                  </div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "8px" }}>
                    {t("listings.raising")}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* The single next action: the dialed-in pair, carried into the
              directory as applied filters. */}
          <div style={{ borderTop: "1px solid var(--cr-rule)", padding: "16px" }}>
            <Link
              href={directoryHref}
              className="btn-copper-shimmer"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", background: "var(--cr-copper)", color: "var(--cr-band-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", padding: "12px 24px", borderRadius: "999px", minHeight: "48px" }}
            >
              {tf("match.cta", "See the matching rounds")} →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
