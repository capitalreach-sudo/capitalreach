"use client";

import { useState, type ElementType } from "react";
import Link from "next/link";
import {
  Brain, Sparkles, FileSearch, ArrowRight, CheckCircle2,
  Loader2, AlertCircle, Zap, Lock, TrendingUp, Users,
  ChevronRight,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

// ── Score helpers ──────────────────────────────────────────────
function ScoreBar({ label, value }: { label: string; value: number }) {
  const fillColor = value >= 80 ? "var(--cr-up)" : value >= 60 ? "var(--cr-copper)" : "var(--cr-down)";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-3)" }}>{label}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)" }}>{value}</span>
      </div>
      <div style={{ height: "4px", background: "var(--cr-rule)", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: "2px", transition: "width 700ms ease", width: `${value}%`, background: fillColor }} />
      </div>
    </div>
  );
}

function verdictStyle(v: string): React.CSSProperties {
  if (v === "Exceptional" || v === "Strong")
    return { background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.25)", color: "var(--cr-up)" };
  if (v === "Promising")
    return { background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)" };
  return { background: "var(--cr-down-bg)", border: "1px solid rgba(180,50,50,0.2)", color: "var(--cr-down)" };
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--cr-down-bg)", border: "1px solid rgba(180,50,50,0.2)", borderRadius: "4px", padding: "12px 16px" }}>
      <AlertCircle style={{ width: 16, height: 16, color: "var(--cr-down)", flexShrink: 0 }} />
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-down)" }}>{msg}</p>
    </div>
  );
}

// ── Pitch Analyzer ─────────────────────────────────────────────
interface PitchResult {
  overall_score: number; clarity_score: number; market_score: number;
  moat_score: number; team_score: number; traction_score: number;
  verdict: string; strengths: string[]; improvements: string[]; key_insight: string;
}

function PitchTab() {
  const { t } = useTranslation();
  const [pitch, setPitch]     = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<PitchResult | null>(null);
  const [error, setError]     = useState("");
  const [focused, setFocused] = useState(false);

  async function analyze() {
    if (pitch.trim().length < 30) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res  = await fetch("/api/ai/analyze-pitch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitch_text: pitch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setResult(data);
    } catch (e: any) {
      setError(e.message || "Pitch analysis failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px" }}>
      {/* Input */}
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "22px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("ai.pitch.title")}</h3>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", lineHeight: 1.6 }}>
            Describe your startup — problem, solution, market size, team background, and traction.
            GPT-4o will score it across 5 investment dimensions and give actionable feedback.
          </p>
        </div>
        <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <Sparkles style={{ width: 14, height: 14, color: "var(--cr-copper)", marginTop: "2px", flexShrink: 0 }} />
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-copper)", lineHeight: 1.5 }}>
            <strong>Pro tip:</strong> Include TAM, MRR/growth rate, prior exits, team bios, and key metrics for the most accurate score.
          </p>
        </div>
        <textarea
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={`Example:\n\nWe're building AI that transcribes clinical encounters in real-time, reducing documentation by 70% for rural healthcare providers.\n\nProblem: Physicians spend 3+ hours/day on admin, causing $18B in lost productivity.\n\nTraction: $42K MRR, 18% MoM growth, 3 hospital LOIs. Ex-Epic + Stanford clinical AI PhD.`}
          rows={12}
          style={{
            width: "100%", borderRadius: "4px",
            border: `1px solid ${focused ? "var(--cr-copper)" : "var(--cr-rule-dark)"}`,
            background: "var(--cr-paper-2)", padding: "12px 14px",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px",
            color: "var(--cr-ink)", resize: "none", outline: "none",
            lineHeight: 1.6, transition: "border-color 150ms ease",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={analyze} disabled={pitch.trim().length < 30 || loading}
            style={{
              flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
              fontSize: "14px", height: "42px", padding: "0 24px", borderRadius: "4px", border: "none",
              cursor: pitch.trim().length < 30 || loading ? "not-allowed" : "pointer",
              opacity: pitch.trim().length < 30 || loading ? 0.5 : 1, transition: "opacity 150ms",
            }}>
            {loading ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> {t("ai.pitch.analyzing")}</> : <><Sparkles style={{ width: 14, height: 14 }} /> {t("ai.pitch.analyzeBtn")}</>}
          </button>
          {result && (
            <button onClick={() => { setResult(null); setError(""); }}
              style={{
                background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)",
                color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400,
                fontSize: "13px", height: "42px", padding: "0 16px", borderRadius: "4px", cursor: "pointer",
              }}>
              {t("ai.pitch.clear")}
            </button>
          )}
        </div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>
          Powered by GPT-4o · ~3 seconds · 5 free analyses/hour · No data stored
        </p>
        {error && <ErrorBox msg={error} />}
      </div>

      {/* Results */}
      <div>
        {!result && !loading && (
          <div style={{
            minHeight: "400px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "var(--cr-paper-2)", border: "1px dashed var(--cr-rule-dark)", borderRadius: "4px",
            padding: "48px", textAlign: "center",
          }}>
            <div style={{ width: 56, height: 56, borderRadius: "4px", background: "var(--cr-copper-bg)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
              <Sparkles style={{ width: 28, height: 28, color: "var(--cr-copper)" }} />
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink-3)", marginBottom: "6px" }}>{t("ai.pitch.resultsEmpty")}</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", maxWidth: "240px", lineHeight: 1.5 }}>
              {t("ai.pitch.resultsEmptySub")}
            </p>
          </div>
        )}

        {loading && (
          <div style={{
            minHeight: "400px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px",
            padding: "48px", textAlign: "center",
          }}>
            <div style={{ position: "relative", display: "inline-flex", marginBottom: "20px" }}>
              <div style={{ width: 56, height: 56, borderRadius: "4px", background: "var(--cr-paper-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Sparkles style={{ width: 28, height: 28, color: "var(--cr-copper)" }} />
              </div>
              <Loader2 style={{ position: "absolute", top: "-6px", right: "-6px", width: 20, height: 20, color: "var(--cr-copper)" }} className="animate-spin" />
            </div>
            <p style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "18px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("ai.pitch.evaluating")}</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.5 }}>
              {t("ai.pitch.evaluatingSub")}
            </p>
          </div>
        )}

        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <Sparkles style={{ width: 14, height: 14, color: "var(--cr-copper)" }} />
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)" }}>{t("ai.pitch.reportTitle")}</span>
                  </div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>{t("ai.pitch.generatedBy")}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "48px", color: "var(--cr-copper)", lineHeight: 1 }}>{result.overall_score}</p>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "2px" }}>{t("ai.pitch.outOf100")}</p>
                  <span style={{ ...verdictStyle(result.verdict), fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", borderRadius: "3px", padding: "3px 8px", display: "inline-block", marginTop: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {result.verdict}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <ScoreBar label={t("ai.pitch.dimClarity")}  value={result.clarity_score} />
                <ScoreBar label={t("ai.pitch.dimMarket")}   value={result.market_score}  />
                <ScoreBar label={t("ai.pitch.dimMoat")}     value={result.moat_score}    />
                <ScoreBar label={t("ai.pitch.dimTeam")}     value={result.team_score}    />
                <ScoreBar label={t("ai.pitch.dimTraction")} value={result.traction_score}/>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div style={{ background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.2)", borderRadius: "4px", padding: "14px" }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-up)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <CheckCircle2 style={{ width: 12, height: 12 }} /> {t("ai.pitch.whatsWorking")}
                </p>
                <ul style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {result.strengths.map((s) => (
                    <li key={s} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.5 }}>• {s}</li>
                  ))}
                </ul>
              </div>
              <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "14px" }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  ⚡ {t("ai.pitch.improveThis")}
                </p>
                <ul style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {result.improvements.map((s) => (
                    <li key={s} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.5 }}>• {s}</li>
                  ))}
                </ul>
              </div>
            </div>

            {result.key_insight && (
              <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "12px 16px" }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-copper)", lineHeight: 1.5 }}>
                  💡 <strong>{t("ai.pitch.keyTakeaway")}:</strong> {result.key_insight}
                </p>
              </div>
            )}

            <Link href="/auth/signup?role=startup"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                width: "100%", height: "42px", background: "var(--cr-copper)", color: "#fff",
                fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
                borderRadius: "4px", textDecoration: "none", transition: "opacity 150ms",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
              {t("ai.pitch.saveShare")}
              <ArrowRight style={{ width: 14, height: 14 }} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Investor Matching ──────────────────────────────────────────
interface MatchResult {
  id: string; slug: string; name: string; type: string;
  industries: string[]; stages: string[];
  minCheck: number | null; maxCheck: number | null;
  geography: string[]; matchScore: number; matchReason: string; initials: string;
}

const INDUSTRIES = [
  "AI / Machine Learning", "B2B SaaS", "FinTech", "HealthTech",
  "EdTech", "Climate / CleanTech", "Marketplace", "DeepTech",
  "Consumer", "Crypto / Web3", "HRTech", "Cybersecurity",
];
const STAGES      = ["Pre-Seed", "Seed", "Series A", "Series B+"];
const MRR_OPTIONS = ["Pre-Revenue", "$0–10K", "$10–50K", "$50–200K", "$200K+"];

function fmtCheck(n: number | null) {
  if (!n) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function SelectChip({ value, active, onClick }: { value: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        fontFamily: "'DM Sans', sans-serif", fontWeight: active ? 600 : 400,
        fontSize: "12px", padding: "5px 12px", borderRadius: "3px",
        border: active ? "1px solid var(--cr-copper)" : "1px solid var(--cr-rule-dark)",
        background: active ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
        color: active ? "var(--cr-copper)" : "var(--cr-ink-3)",
        cursor: "pointer", transition: "all 120ms ease",
      }}>
      {value}
    </button>
  );
}

function StageChip({ value, active, onClick }: { value: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        fontFamily: "'DM Sans', sans-serif", fontWeight: active ? 600 : 400,
        fontSize: "13px", padding: "10px 16px", borderRadius: "4px",
        border: active ? "2px solid var(--cr-copper)" : "2px solid var(--cr-rule-dark)",
        background: active ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
        color: active ? "var(--cr-copper)" : "var(--cr-ink-3)",
        cursor: "pointer", transition: "all 120ms ease", textAlign: "left", width: "100%",
      }}>
      {value}
    </button>
  );
}

function MatchingTab() {
  const { t } = useTranslation();
  const [industry, setIndustry]       = useState("B2B SaaS");
  const [stage, setStage]             = useState("Seed");
  const [mrr, setMrr]                 = useState("$0–10K");
  const [description, setDescription] = useState("");
  const [loading, setLoading]         = useState(false);
  const [matches, setMatches]         = useState<MatchResult[] | null>(null);
  const [message, setMessage]         = useState("");
  const [error, setError]             = useState("");
  const [descFocused, setDescFocused] = useState(false);

  async function findMatches() {
    setLoading(true); setError(""); setMatches(null); setMessage("");
    try {
      const res  = await fetch("/api/ai/smart-match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, stage, mrr, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Matching failed");
      setMatches(data.matches || []);
      if (data.message) setMessage(data.message);
    } catch (e: any) {
      setError(e.message || "Investor matching failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <div>
        <h3 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "22px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("ai.matching.title")}</h3>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", lineHeight: 1.6 }}>
          Tell us about your startup and our AI will identify your best-fit investors from the
          CapitalReach network — matching on industry, stage, check size, and geography.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
        <div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>{t("ai.matching.industryLabel")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {INDUSTRIES.map((i) => (
              <SelectChip key={i} value={i} active={industry === i} onClick={() => setIndustry(i)} />
            ))}
          </div>
        </div>
        <div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>{t("ai.matching.stageLabel")}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {STAGES.map((s) => (
              <StageChip key={s} value={s} active={stage === s} onClick={() => setStage(s)} />
            ))}
          </div>
        </div>
        <div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>{t("ai.matching.mrrLabel")}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {MRR_OPTIONS.map((m) => (
              <StageChip key={m} value={m} active={mrr === m} onClick={() => setMrr(m)} />
            ))}
          </div>
        </div>
      </div>

      <div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
          {t("ai.matching.descLabel")}
          <span style={{ textTransform: "none", fontWeight: 300, color: "var(--cr-ink-4)", marginLeft: "6px" }}>— {t("common.optional")}, improves match quality</span>
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onFocus={() => setDescFocused(true)}
          onBlur={() => setDescFocused(false)}
          placeholder="e.g. AI-powered clinical documentation for rural healthcare. $42K MRR, 18% MoM growth, 3 hospital network LOIs."
          rows={3}
          style={{
            width: "100%", borderRadius: "4px",
            border: `1px solid ${descFocused ? "var(--cr-copper)" : "var(--cr-rule-dark)"}`,
            background: "var(--cr-paper-2)", padding: "12px 14px",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px",
            color: "var(--cr-ink)", resize: "none", outline: "none",
            lineHeight: 1.5, transition: "border-color 150ms ease", boxSizing: "border-box",
          }}
        />
      </div>

      <button onClick={findMatches} disabled={loading}
        style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
          fontSize: "14px", height: "42px", padding: "0 24px", borderRadius: "4px", border: "none",
          cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1, transition: "opacity 150ms",
        }}>
        {loading
          ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> {t("ai.matching.finding")}</>
          : <><Brain style={{ width: 14, height: 14 }} /> {t("ai.matching.findBtn")}</>
        }
      </button>

      {error && <ErrorBox msg={error} />}

      {message && !matches?.length && (
        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "12px 16px" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)" }}>{message}</p>
        </div>
      )}

      {matches && matches.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "var(--cr-ink)" }}>{t("ai.matching.results")}</h4>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", border: "1px solid var(--cr-copper-br)", borderRadius: "3px", padding: "3px 10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {matches.length} match{matches.length !== 1 ? "es" : ""} found
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px", marginBottom: "20px" }}>
            {matches.map((m) => (
              <Link key={m.id} href={`/investors/${m.slug}`}
                style={{
                  display: "flex", alignItems: "flex-start", gap: "12px",
                  background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
                  borderRadius: "4px", padding: "16px", textDecoration: "none",
                  transition: "border-color 120ms ease",
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)")}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")}>
                <div style={{ width: 40, height: 40, borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "14px", flexShrink: 0, background: "var(--cr-copper-bg)", color: "var(--cr-copper)" }}>
                  {m.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "2px" }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</p>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "14px", color: "var(--cr-copper)", flexShrink: 0 }}>{m.matchScore}%</span>
                  </div>
                  {(m.minCheck || m.maxCheck) && (
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginBottom: "4px" }}>
                      {fmtCheck(m.minCheck) ?? "Open"} – {fmtCheck(m.maxCheck) ?? "Open"}
                    </p>
                  )}
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", lineHeight: 1.5 }}>{m.matchReason}</p>
                  {m.industries?.length > 0 && (
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "8px" }}>
                      {m.industries.slice(0, 3).map((ind) => (
                        <span key={ind} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "10px", background: "var(--cr-paper-3)", color: "var(--cr-ink-4)", border: "1px solid var(--cr-rule)", borderRadius: "3px", padding: "2px 6px" }}>
                          {ind}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
          <div style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)" }}>{t("ai.matching.messageCta")}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", marginTop: "4px" }}>{t("ai.matching.messageCtaSub")}</p>
            </div>
            <Link href="/auth/signup?role=startup"
              style={{
                flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "6px",
                background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif",
                fontWeight: 600, fontSize: "13px", padding: "0 20px", height: "40px",
                borderRadius: "4px", textDecoration: "none", transition: "opacity 150ms",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
              {t("pricing.getStartedFree")} <ArrowRight style={{ width: 14, height: 14 }} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Due Diligence ──────────────────────────────────────────────
interface StartupSuggestion {
  id: string; slug: string; name: string; industry: string | null; stage: string | null;
}

function DiligenceTab() {
  const { t } = useTranslation();
  const DD_STEPS = [
    t("ai.diligence.step1"),
    t("ai.diligence.step2"),
    t("ai.diligence.step3"),
    t("ai.diligence.step4"),
    t("ai.diligence.step5"),
  ];
  const [query, setQuery]               = useState("");
  const [suggestions, setSuggestions]   = useState<StartupSuggestion[]>([]);
  const [selected, setSelected]         = useState<StartupSuggestion | null>(null);
  const [loading, setLoading]           = useState(false);
  const [stepIdx, setStepIdx]           = useState(0);
  const [report, setReport]             = useState<string | null>(null);
  const [error, setError]               = useState("");
  const [inputFocused, setInputFocused] = useState(false);

  async function searchStartups(q: string) {
    setQuery(q);
    if (!selected) setSuggestions([]);
    if (q.length < 2) { setSuggestions([]); return; }
    try {
      const res = await fetch(`/api/startups/search?q=${encodeURIComponent(q)}&limit=6`);
      if (res.ok) setSuggestions((await res.json()).startups || []);
    } catch { /* ignore */ }
  }

  function selectStartup(s: StartupSuggestion) {
    setSelected(s); setQuery(s.name); setSuggestions([]);
  }

  async function generateReport() {
    if (!selected) return;
    setLoading(true); setReport(null); setError(""); setStepIdx(0);
    const interval = setInterval(() => setStepIdx((i) => Math.min(i + 1, DD_STEPS.length - 1)), 1400);
    try {
      const res  = await fetch("/api/ai/due-diligence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startupId: selected.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { setError("auth_required"); }
        else if (res.status === 403) { setError("upgrade_required"); }
        else {
          setError(data.error || "Report generation failed.");
        }
      } else {
        setReport(data.report || data.content || "");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      clearInterval(interval); setLoading(false); setStepIdx(0);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <div>
        <h3 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "22px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("ai.diligence.title")}</h3>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", lineHeight: 1.6 }}>
          Get a comprehensive investment memo on any startup in the CapitalReach network in seconds.
          Covers market analysis, team, competitive landscape, risks, and a Buy / Watch / Pass verdict.
          Included unlimited with Pro Investor and Institution plans.
        </p>
      </div>

      <div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>{t("ai.diligence.searchLabel")}</p>
        <div style={{ position: "relative" }}>
          <input type="text" value={query}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onChange={(e) => { setSelected(null); searchStartups(e.target.value); }}
            placeholder="e.g. Vaultrise, HealthAI, ClimateOS…"
            style={{
              width: "100%", borderRadius: "4px",
              border: `1px solid ${inputFocused ? "var(--cr-copper)" : "var(--cr-rule-dark)"}`,
              background: "var(--cr-paper-2)", padding: "12px 14px",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px",
              color: "var(--cr-ink)", outline: "none", transition: "border-color 150ms ease",
              boxSizing: "border-box",
            }}
          />
          {suggestions.length > 0 && (
            <div style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", zIndex: 20, overflow: "hidden" }}>
              {suggestions.map((s) => (
                <button key={s.id} onClick={() => selectStartup(s)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: "10px",
                    padding: "10px 14px", background: "transparent", border: "none",
                    borderBottom: "1px solid var(--cr-rule)", cursor: "pointer", textAlign: "left",
                    transition: "background 120ms ease",
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--cr-paper-3)")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
                  <div style={{ width: 28, height: 28, borderRadius: "3px", background: "var(--cr-copper-bg)", color: "var(--cr-copper)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "11px", flexShrink: 0 }}>
                    {s.name[0]}
                  </div>
                  <div>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{s.name}</p>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>{[s.industry, s.stage].filter(Boolean).join(" · ")}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {selected && (
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-copper)", marginTop: "6px", display: "flex", alignItems: "center", gap: "5px" }}>
            <CheckCircle2 style={{ width: 12, height: 12 }} /> {t("ai.diligence.selected", { name: selected.name })}
          </p>
        )}
      </div>

      <button onClick={generateReport} disabled={loading || !selected}
        style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
          fontSize: "14px", height: "42px", padding: "0 24px", borderRadius: "4px", border: "none",
          cursor: loading || !selected ? "not-allowed" : "pointer",
          opacity: loading || !selected ? 0.5 : 1, transition: "opacity 150ms",
        }}>
        {loading
          ? <><Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> {DD_STEPS[stepIdx]}</>
          : <><FileSearch style={{ width: 14, height: 14 }} /> {t("ai.diligence.generateBtn")}</>
        }
      </button>

      {error === "auth_required" && (
        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px", textAlign: "center" }}>
          <Lock style={{ width: 28, height: 28, color: "var(--cr-copper)", margin: "0 auto 10px" }} />
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "var(--cr-ink)", marginBottom: "4px" }}>{t("ai.diligence.signInTitle")}</p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", marginBottom: "20px" }}>{t("ai.diligence.signInSub")}</p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
            <Link href="/auth/login"
              style={{ border: "1px solid var(--cr-rule-dark)", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", padding: "0 20px", height: "40px", borderRadius: "4px", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
              {t("auth.signIn")}
            </Link>
            <Link href="/auth/signup?role=investor"
              style={{ background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", padding: "0 20px", height: "40px", borderRadius: "4px", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
              {t("auth.register")}
            </Link>
          </div>
        </div>
      )}
      {error === "upgrade_required" && (
        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px", textAlign: "center" }}>
          <Zap style={{ width: 28, height: 28, color: "var(--cr-copper)", margin: "0 auto 10px" }} />
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "var(--cr-ink)", marginBottom: "4px" }}>{t("ai.diligence.upgradeTitle")}</p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", marginBottom: "20px" }}>{t("ai.diligence.signInSub")}</p>
          <Link href="/pricing"
            style={{ background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", padding: "0 20px", height: "40px", borderRadius: "4px", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            {t("ai.diligence.viewPlans")}
          </Link>
        </div>
      )}
      {error && error !== "auth_required" && error !== "upgrade_required" && <ErrorBox msg={error} />}

      {report && (
        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ height: "3px", background: "var(--cr-copper)" }} />
          <div style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <FileSearch style={{ width: 14, height: 14, color: "var(--cr-copper)" }} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)" }}>
                Due Diligence Report — {selected?.name}
              </span>
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{report}</p>
          </div>
        </div>
      )}

      {!report && !loading && (
        <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
          <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", marginBottom: "16px" }}>{t("ai.diligence.reportIncludes")}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {[
              ["📋", "Executive Summary"],
              ["📊", "Market Opportunity — TAM & timing"],
              ["👥", "Team Assessment"],
              ["📈", "Traction Analysis"],
              ["🛡️", "Competitive Landscape"],
              ["⚠️", "Top 3 Key Risks"],
              ["🏆", "Comparable Companies"],
              ["⚡", "Investment Verdict — Buy / Watch / Pass"],
            ].map(([icon, text]) => (
              <div key={text as string} style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)" }}>
                <span>{icon}</span> {text}
              </div>
            ))}
          </div>
          <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid var(--cr-rule)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "20px", color: "var(--cr-ink)" }}>{t("ai.diligence.proInvestor")}</span>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "2px" }}>{t("ai.diligence.unlimitedIncluded")}</p>
            </div>
            <Link href="/auth/signup?role=investor"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", padding: "0 20px", height: "40px", borderRadius: "4px", textDecoration: "none", flexShrink: 0 }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
              {t("pricing.getStartedFree")} <ArrowRight style={{ width: 13, height: 13 }} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tier check ─────────────────────────────────────────────────

function TierCheck({ val }: { val: string | boolean }) {
  if (val === false) return <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--cr-ink-4)", fontSize: "16px" }}>—</span>;
  if (val === true)  return <CheckCircle2 style={{ width: 15, height: 15, color: "var(--cr-up)", margin: "0 auto", display: "block" }} />;
  return <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)" }}>{val}</span>;
}

// ── Tabs config ────────────────────────────────────────────────
type Tab = "pitch" | "matching" | "diligence";

// ── Main Hub ───────────────────────────────────────────────────
export function AiToolsHub() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("pitch");

  const TABS: { id: Tab; label: string; icon: ElementType; desc: string }[] = [
    { id: "pitch",     label: t("ai.tabs.pitchAnalyzer"), icon: Sparkles,   desc: t("ai.tabs.pitchDesc") },
    { id: "matching",  label: t("ai.tabs.investorMatch"), icon: Brain,      desc: t("ai.tabs.matchDesc") },
    { id: "diligence", label: t("ai.tabs.dueDiligence"),  icon: FileSearch, desc: t("ai.tabs.ddDesc")   },
  ];

  const TIER_ROWS = [
    { feature: t("ai.tier.pitchAnalyzer"),    free: "5/hr",      angel: "20/hr",      pro: t("common.unlimited") },
    { feature: t("ai.tier.investorMatching"), free: "5/hr",      angel: "20/hr",      pro: t("common.unlimited") },
    { feature: t("ai.tier.dueDiligence"),     free: false,       angel: false,        pro: t("common.unlimited") },
    { feature: t("ai.tier.aiScore"),          free: "View only", angel: true,         pro: true                  },
    { feature: t("ai.tier.savedReports"),     free: false,       angel: false,        pro: true                  },
    { feature: t("ai.tier.exportPdf"),        free: false,       angel: false,        pro: true                  },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--cr-paper)" }}>
      {/* Hero */}
      <div style={{ background: "var(--cr-paper)", borderBottom: "1px solid var(--cr-rule)", marginTop: "64px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "64px 40px 56px" }}>
          <div className="ruled-label" style={{ marginBottom: "24px" }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {t("ai.hub.heroPowered")}
            </span>
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "58px", color: "var(--cr-ink)", lineHeight: 0.95, letterSpacing: "-0.02em", marginBottom: "16px" }}>
            {t("ai.hub.heroLine1")}<br />
            <span style={{ color: "var(--cr-copper)" }}>{t("ai.hub.heroLine2")}</span>
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "16px", color: "var(--cr-ink-3)", maxWidth: "480px", marginBottom: "40px", lineHeight: 1.6 }}>
            Three powerful AI tools in one place — analyze pitches, match with the right investors,
            and generate due diligence reports. All real GPT-4o, all in seconds.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            {[
              { icon: Sparkles,   label: "Pitch Analyses",    val: "Real GPT"       },
              { icon: Brain,      label: "Investor Matching",  val: "AI-Powered"     },
              { icon: FileSearch, label: "Due Diligence",      val: "500-word Memos" },
              { icon: Zap,        label: "Analysis Speed",     val: "~3 seconds"     },
            ].map(({ icon: Icon, label, val }) => (
              <div key={label} style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "16px" }}>
                <Icon style={{ width: 18, height: 18, color: "var(--cr-copper)", marginBottom: "8px" }} />
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)" }}>{val}</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "2px" }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ position: "sticky", top: "64px", zIndex: 30, background: "var(--cr-paper)", borderBottom: "1px solid var(--cr-rule)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 40px", display: "flex", gap: "4px", overflowX: "auto" }}>
          {TABS.map(({ id, label, icon: Icon, desc }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "16px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                fontSize: "13px", border: "none", borderBottom: `2px solid ${activeTab === id ? "var(--cr-copper)" : "transparent"}`,
                background: "transparent", color: activeTab === id ? "var(--cr-copper)" : "var(--cr-ink-4)",
                cursor: "pointer", whiteSpace: "nowrap", transition: "color 120ms, border-color 120ms",
              }}>
              <Icon style={{ width: 14, height: 14 }} />
              {label}
              <span style={{ fontSize: "11px", fontWeight: 300, color: "var(--cr-ink-4)" }}>— {desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px" }}>
        {activeTab === "pitch"     && <PitchTab />}
        {activeTab === "matching"  && <MatchingTab />}
        {activeTab === "diligence" && <DiligenceTab />}
      </div>

      {/* Tier comparison */}
      <div style={{ background: "var(--cr-paper-2)", borderTop: "1px solid var(--cr-rule)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "64px 40px" }}>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "36px", color: "var(--cr-ink)", marginBottom: "8px" }}>{t("ai.hub.tablePlansTitle")}</h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)" }}>{t("ai.hub.tablePlansSub")}</p>
          </div>

          <div style={{ background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--cr-rule)" }}>
                    <th style={{ textAlign: "left", padding: "16px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.06em", width: "200px" }}>Feature</th>
                    {[
                      { tier: "Free",         sub: "Always free", highlight: false },
                      { tier: "Angel",        sub: "$99/mo",      highlight: false },
                      { tier: "Pro Investor", sub: "$249/mo",     highlight: true  },
                    ].map(({ tier, sub, highlight }) => (
                      <th key={tier} style={{ padding: "16px", textAlign: "center", background: highlight ? "var(--cr-copper-bg)" : "transparent" }}>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "14px", color: highlight ? "var(--cr-copper)" : "var(--cr-ink)" }}>{tier}</p>
                        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "2px" }}>{sub}</p>
                        {highlight && (
                          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", background: "var(--cr-copper)", color: "#fff", borderRadius: "3px", padding: "2px 8px", display: "inline-block", marginTop: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Best Value
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIER_ROWS.map((row, i) => (
                    <tr key={row.feature} style={{ borderBottom: "1px solid var(--cr-rule)", background: i % 2 === 0 ? "transparent" : "var(--cr-paper-2)" }}>
                      <td style={{ padding: "14px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-3)" }}>{row.feature}</td>
                      <td style={{ padding: "14px", textAlign: "center" }}><TierCheck val={row.free} /></td>
                      <td style={{ padding: "14px", textAlign: "center", background: "rgba(181,101,29,0.03)" }}><TierCheck val={row.angel} /></td>
                      <td style={{ padding: "14px", textAlign: "center", background: "var(--cr-copper-bg)" }}><TierCheck val={row.pro} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "32px", flexWrap: "wrap" }}>
            <Link href="/auth/signup?role=investor"
              style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", height: "48px", padding: "0 28px", borderRadius: "4px", textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
              <Users style={{ width: 15, height: 15 }} /> {t("ai.hub.startInvestor")}
            </Link>
            <Link href="/auth/signup?role=startup"
              style={{ display: "inline-flex", alignItems: "center", gap: "8px", border: "1px solid var(--cr-rule-dark)", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "14px", height: "48px", padding: "0 28px", borderRadius: "4px", textDecoration: "none", background: "var(--cr-paper)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-copper)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)"; (e.currentTarget as HTMLElement).style.color = "var(--cr-ink-3)"; }}>
              <TrendingUp style={{ width: 15, height: 15 }} /> {t("ai.hub.listStartup")}
            </Link>
            <Link href="/pricing"
              style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--cr-ink-4)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px", height: "48px", padding: "0 20px", borderRadius: "4px", textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--cr-copper)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--cr-ink-4)")}>
              {t("ai.hub.viewPricing")} <ChevronRight style={{ width: 14, height: 14 }} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
