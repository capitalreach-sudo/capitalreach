"use client";

import { useState, memo } from "react";
import Link from "next/link";
import { Brain, Sparkles, FileSearch, X, Loader2, CheckCircle2, ArrowRight, Zap, TrendingUp } from "lucide-react";

// ── CR design tokens ──────────────────────────────────────────
const C = {
  paper:    "#F5F0E8",
  paper2:   "#EDE8DE",
  paper3:   "#E4DDD2",
  ink:      "#1A1612",
  ink2:     "#3D3630",
  ink3:     "#6B6056",
  muted:    "#9C8E82",
  rule:     "rgba(26,22,18,0.1)",
  ruleMid:  "rgba(26,22,18,0.15)",
  copper:   "#B5651D",
  copperBg: "rgba(181,101,29,0.06)",
  copperBr: "rgba(181,101,29,0.2)",
  up:       "#2D6A4F",
  upBg:     "rgba(45,106,79,0.08)",
  down:     "#9B2335",
  downBg:   "rgba(155,35,53,0.08)",
} as const;

// ── Primitives ─────────────────────────────────────────────────
function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? C.up : value >= 60 ? C.copper : "#B85A00";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.muted }}>{label}</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, fontSize: 11, color: C.copper }}>{value}</span>
      </div>
      <div style={{ height: 4, background: C.paper3, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 2, background: color, width: `${value}%`, transition: "width 600ms ease" }} />
      </div>
    </div>
  );
}

// ── Modal shell ─────────────────────────────────────────────────
function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(26,22,18,0.55)", padding: "32px 16px", overflowY: "auto" }}>
      <div style={{ background: C.paper, border: `1px solid ${C.ruleMid}`, borderRadius: 8, width: "100%", maxWidth: 560, position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: C.muted, lineHeight: 0 }}>
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}

// ── Pitch Modal ─────────────────────────────────────────────────
interface PitchResult {
  overall_score: number; clarity_score: number; market_score: number;
  moat_score: number; team_score: number; traction_score: number;
  verdict: string; strengths: string[]; improvements: string[]; key_insight: string;
}

function verdictColor(v: string) {
  if (v === "Exceptional" || v === "Strong") return C.up;
  if (v === "Promising") return C.copper;
  return C.down;
}

function PitchModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"input" | "loading" | "result" | "error">("input");
  const [pitch, setPitch] = useState("");
  const [result, setResult] = useState<PitchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function analyze() {
    if (pitch.trim().length < 30) return;
    setStep("loading");
    try {
      const res = await fetch("/api/ai/analyze-pitch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitch_text: pitch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setResult(data); setStep("result");
    } catch (e: any) {
      setErrorMsg(e.message || "Pitch analysis failed. Check your connection and try again.");
      setStep("error");
    }
  }

  return (
    <ModalShell onClose={onClose}>
      {step === "input" && (
        <div style={{ padding: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 6, background: C.copperBg, border: `1px solid ${C.copperBr}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Sparkles size={18} style={{ color: C.copper }} />
          </div>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontStyle: "italic", fontSize: 20, color: C.ink, marginBottom: 6 }}>AI Pitch Analyzer</h2>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 300, fontSize: 13, color: C.ink3, marginBottom: 20, lineHeight: 1.6 }}>
            Paste your pitch — GPT-4o-mini scores it across 5 dimensions in seconds.
          </p>
          <textarea
            value={pitch} onChange={e => setPitch(e.target.value)}
            placeholder="Describe your startup, the problem, your solution, traction, team, and why now…"
            rows={6}
            style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${C.ruleMid}`, borderRadius: 4, padding: "10px 12px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.ink, background: C.paper2, resize: "none", outline: "none", marginBottom: 16, lineHeight: 1.6 }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, height: 40, background: "transparent", border: `1px solid ${C.ruleMid}`, borderRadius: 4, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.ink3 }}>Cancel</button>
            <button onClick={analyze} disabled={pitch.trim().length < 30}
              style={{ flex: 1, height: 40, background: pitch.trim().length >= 30 ? C.copper : C.paper3, color: pitch.trim().length >= 30 ? "#fff" : C.muted, border: "none", borderRadius: 4, cursor: pitch.trim().length >= 30 ? "pointer" : "not-allowed", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Sparkles size={14} /> Analyze Pitch
            </button>
          </div>
          <p style={{ textAlign: "center", fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.muted, marginTop: 12 }}>Powered by GPT-4o-mini · ~3 seconds · No fake results</p>
        </div>
      )}

      {step === "loading" && (
        <div style={{ padding: 48, textAlign: "center" }}>
          <div style={{ position: "relative", display: "inline-flex", marginBottom: 20 }}>
            <div style={{ width: 56, height: 56, borderRadius: 8, background: C.copperBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={24} style={{ color: C.copper }} />
            </div>
            <Loader2 size={16} style={{ position: "absolute", top: -4, right: -4, color: C.copper, animation: "spin 1s linear infinite" }} />
          </div>
          <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 15, color: C.ink, marginBottom: 6 }}>Analyzing your pitch…</h3>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 300, fontSize: 13, color: C.muted }}>GPT-4o-mini is evaluating clarity, market, moat, team &amp; traction.</p>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {step === "error" && (
        <div style={{ padding: 24, textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 8, background: C.downBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <X size={22} style={{ color: C.down }} />
          </div>
          <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 15, color: C.ink, marginBottom: 8 }}>Analysis failed</h3>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 300, fontSize: 13, color: C.ink3, marginBottom: 20 }}>{errorMsg}</p>
          <button onClick={() => setStep("input")} style={{ width: "100%", height: 40, background: "transparent", border: `1px solid ${C.ruleMid}`, borderRadius: 4, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.ink3 }}>Try Again</button>
        </div>
      )}

      {step === "result" && result && (
        <div style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Sparkles size={14} style={{ color: C.copper }} />
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 15, color: C.ink }}>Pitch Analysis Report</span>
              </div>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 300, fontSize: 12, color: C.muted }}>Generated by GPT-4o-mini</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 32, color: C.copper, lineHeight: 1 }}>{result.overall_score}</div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.muted, marginTop: 2 }}>/ 100</div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 11, color: verdictColor(result.verdict), marginTop: 2 }}>{result.verdict}</div>
            </div>
          </div>

          <div style={{ background: C.paper2, borderRadius: 4, padding: "14px 16px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <ScoreBar label="Clarity & Narrative" value={result.clarity_score} />
            <ScoreBar label="Market Opportunity"  value={result.market_score} />
            <ScoreBar label="Competitive Moat"    value={result.moat_score} />
            <ScoreBar label="Team Strength"        value={result.team_score} />
            <ScoreBar label="Traction Evidence"    value={result.traction_score} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div style={{ background: C.upBg, border: `1px solid rgba(45,106,79,0.2)`, borderRadius: 4, padding: 12 }}>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 11, color: C.up, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCircle2 size={12} /> Strengths
              </p>
              {result.strengths.map(s => <p key={s} style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 300, fontSize: 11, color: C.up, lineHeight: 1.5 }}>• {s}</p>)}
            </div>
            <div style={{ background: "rgba(184,90,0,0.06)", border: `1px solid rgba(184,90,0,0.2)`, borderRadius: 4, padding: 12 }}>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 11, color: "#B85A00", marginBottom: 8 }}>⚡ Improve</p>
              {result.improvements.map(s => <p key={s} style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 300, fontSize: 11, color: "#B85A00", lineHeight: 1.5 }}>• {s}</p>)}
            </div>
          </div>

          {result.key_insight && (
            <div style={{ background: C.copperBg, border: `1px solid ${C.copperBr}`, borderRadius: 4, padding: "10px 14px", marginBottom: 16 }}>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 400, fontSize: 12, color: C.copper, lineHeight: 1.55 }}>💡 {result.key_insight}</p>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setPitch(""); setResult(null); setStep("input"); }}
              style={{ flex: 1, height: 40, background: "transparent", border: `1px solid ${C.ruleMid}`, borderRadius: 4, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.ink3 }}>
              Analyze Another
            </button>
            <Link href="/auth/signup?role=startup" style={{ flex: 1, textDecoration: "none" }}>
              <button style={{ width: "100%", height: 40, background: C.copper, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 13 }}>
                Sign Up Free
              </button>
            </Link>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ── Due Diligence Modal ─────────────────────────────────────────
interface SidePanelStartup { id: string; slug: string; name: string; }

function DueDiligenceModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SidePanelStartup[]>([]);
  const [selected, setSelected] = useState<SidePanelStartup | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function search(q: string) {
    setQuery(q); setSelected(null);
    if (q.length < 2) { setSuggestions([]); return; }
    try {
      const res = await fetch(`/api/startups/search?q=${encodeURIComponent(q)}&limit=5`);
      if (res.ok) { const d = await res.json(); setSuggestions(d.startups || []); }
    } catch { /* ignore */ }
  }

  function pick(s: SidePanelStartup) { setSelected(s); setQuery(s.name); setSuggestions([]); }

  async function generate() {
    if (!selected) return;
    setLoading(true); setReport(null); setError("");
    try {
      const res = await fetch("/api/ai/due-diligence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startupId: selected.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          res.status === 401 ? "Sign in as an investor to generate reports." :
          res.status === 402 ? "Upgrade to Angel or Pro to unlock due diligence reports." :
          data.error || "Generation failed."
        );
      } else {
        setReport(data.report || data.content || "");
      }
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <ModalShell onClose={onClose}>
      <div style={{ padding: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 6, background: C.copperBg, border: `1px solid ${C.copperBr}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <FileSearch size={18} style={{ color: C.copper }} />
        </div>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontStyle: "italic", fontSize: 20, color: C.ink, marginBottom: 6 }}>AI Due Diligence Report</h2>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 300, fontSize: 13, color: C.ink3, marginBottom: 20, lineHeight: 1.6 }}>
          Search for any startup on CapitalReach to generate an investment memo.
        </p>

        {!report && (
          <>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <input
                type="text" value={query} onChange={e => search(e.target.value)}
                placeholder="Search startup name…"
                style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${C.ruleMid}`, borderRadius: 4, padding: "10px 12px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.ink, background: C.paper2, outline: "none" }}
              />
              {suggestions.length > 0 && (
                <div style={{ position: "absolute", left: 0, right: 0, top: "100%", marginTop: 4, background: C.paper, border: `1px solid ${C.ruleMid}`, borderRadius: 4, boxShadow: "0 4px 16px rgba(26,22,18,0.1)", zIndex: 10, overflow: "hidden" }}>
                  {suggestions.map(s => (
                    <button key={s.id} onClick={() => pick(s)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.paper2)}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "none")}
                    >
                      <span style={{ width: 24, height: 24, borderRadius: "50%", background: C.copperBg, border: `1px solid ${C.copperBr}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 10, color: C.copper, flexShrink: 0 }}>{s.name[0]}</span>
                      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.ink }}>{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selected && (
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.copper, marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={12} /> {selected.name} selected
              </p>
            )}
            {error && <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.down, marginBottom: 12 }}>{error}</p>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, height: 40, background: "transparent", border: `1px solid ${C.ruleMid}`, borderRadius: 4, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.ink3 }}>Cancel</button>
              <button onClick={generate} disabled={loading || !selected}
                style={{ flex: 1, height: 40, background: selected && !loading ? C.copper : C.paper3, color: selected && !loading ? "#fff" : C.muted, border: "none", borderRadius: 4, cursor: selected && !loading ? "pointer" : "not-allowed", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {loading ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Generating…</> : <><FileSearch size={14} /> Generate Report</>}
              </button>
            </div>
            <p style={{ textAlign: "center", fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.muted, marginTop: 12 }}>$29/report · Free for Pro investors</p>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </>
        )}

        {report && (
          <>
            <div style={{ background: C.paper2, border: `1px solid ${C.ruleMid}`, borderRadius: 4, padding: "14px 16px", marginBottom: 16, maxHeight: 320, overflowY: "auto" }}>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 11, color: C.copper, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <FileSearch size={11} /> {selected?.name}
              </p>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 300, fontSize: 12, color: C.ink3, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{report}</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setReport(null); setSelected(null); setQuery(""); }}
                style={{ flex: 1, height: 40, background: "transparent", border: `1px solid ${C.ruleMid}`, borderRadius: 4, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.ink3 }}>
                New Report
              </button>
              <Link href="/auth/signup?role=investor" style={{ flex: 1, textDecoration: "none" }}>
                <button style={{ width: "100%", height: 40, background: C.copper, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 13 }}>Full Access</button>
              </Link>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}

// ── Matching Modal ──────────────────────────────────────────────
interface MatchResult {
  id: string; slug: string; name: string; type: string;
  industries: string[]; stages: string[];
  matchScore: number; matchReason: string; initials: string;
}

function MatchingModal({ onClose }: { onClose: () => void }) {
  const [industry, setIndustry] = useState("HealthTech");
  const [stage, setStage] = useState("Seed");
  const [mrr, setMrr] = useState("$0–10K");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<MatchResult[] | null>(null);
  const [error, setError] = useState("");

  const INDUSTRIES = ["HealthTech", "FinTech", "EdTech", "CleanTech", "B2B SaaS", "Deep Tech / AI"];
  const STAGES     = ["Pre-Seed", "Seed", "Series A"];
  const MRR_OPTS   = ["Pre-Revenue", "$0–10K", "$10–50K", "$50–200K", "$200K+"];

  async function findMatches() {
    setLoading(true); setError(""); setMatches(null);
    try {
      const res = await fetch("/api/ai/smart-match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, stage, mrr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Matching failed");
      setMatches(data.matches || []);
    } catch (e: any) {
      setError(e.message || "Matching timed out — try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <div style={{ padding: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 6, background: C.copperBg, border: `1px solid ${C.copperBr}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <Brain size={18} style={{ color: C.copper }} />
        </div>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontStyle: "italic", fontSize: 20, color: C.ink, marginBottom: 6 }}>AI Investor Matching</h2>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 300, fontSize: 13, color: C.ink3, marginBottom: 20, lineHeight: 1.6 }}>
          Tell us about your startup — we'll find your best-fit investors from the CapitalReach network.
        </p>

        {!matches && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Industry */}
            <div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 500, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Industry</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {INDUSTRIES.map(i => (
                  <button key={i} onClick={() => setIndustry(i)}
                    style={{ fontSize: 12, padding: "5px 12px", borderRadius: 3, border: `1px solid ${industry === i ? C.copper : C.ruleMid}`, background: industry === i ? C.copperBg : "transparent", color: industry === i ? C.copper : C.ink3, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: industry === i ? 500 : 300 }}>
                    {i}
                  </button>
                ))}
              </div>
            </div>
            {/* Stage */}
            <div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 500, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Stage</div>
              <div style={{ display: "flex", gap: 8 }}>
                {STAGES.map(s => (
                  <button key={s} onClick={() => setStage(s)}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 3, border: `1px solid ${stage === s ? C.copper : C.ruleMid}`, background: stage === s ? C.copperBg : "transparent", color: stage === s ? C.copper : C.ink3, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: stage === s ? 500 : 300, fontSize: 13 }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {/* MRR */}
            <div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 500, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Current MRR</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {MRR_OPTS.map(m => (
                  <button key={m} onClick={() => setMrr(m)}
                    style={{ fontSize: 12, padding: "5px 12px", borderRadius: 3, border: `1px solid ${mrr === m ? C.copper : C.ruleMid}`, background: mrr === m ? C.copperBg : "transparent", color: mrr === m ? C.copper : C.ink3, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: mrr === m ? 500 : 300 }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.down, marginTop: 16 }}>{error}</p>}

        {matches && matches.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 14, color: C.ink }}>Your matches</span>
              <span style={{ background: C.copperBg, border: `1px solid ${C.copperBr}`, borderRadius: 3, padding: "2px 10px", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, fontSize: 11, color: C.copper }}>{matches.length} found</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {matches.map(m => (
                <Link key={m.id} href={`/investors/${m.slug}`} onClick={onClose} style={{ textDecoration: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${C.ruleMid}`, borderRadius: 4, padding: "12px 14px", background: C.paper, cursor: "pointer" }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = C.paper2)}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = C.paper)}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.copperBg, border: `1px solid ${C.copperBr}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 12, color: C.copper, flexShrink: 0 }}>{m.initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 13, color: C.ink, marginBottom: 2 }}>{m.name}</p>
                      <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 300, fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.matchReason}</p>
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 14, color: C.copper, flexShrink: 0 }}>{m.matchScore}%</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {matches && matches.length === 0 && (
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 300, fontSize: 13, color: C.muted, marginTop: 16, textAlign: "center" }}>No matches found — try a different industry or stage.</p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          {matches ? (
            <>
              <button onClick={() => setMatches(null)} style={{ flex: 1, height: 40, background: "transparent", border: `1px solid ${C.ruleMid}`, borderRadius: 4, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.ink3 }}>Refine</button>
              <Link href="/auth/signup?role=startup" style={{ flex: 1, textDecoration: "none" }}>
                <button style={{ width: "100%", height: 40, background: C.copper, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  Get Full Access <ArrowRight size={13} />
                </button>
              </Link>
            </>
          ) : (
            <>
              <button onClick={onClose} style={{ flex: 1, height: 40, background: "transparent", border: `1px solid ${C.ruleMid}`, borderRadius: 4, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: C.ink3 }}>Cancel</button>
              <button onClick={findMatches} disabled={loading}
                style={{ flex: 1, height: 40, background: C.copper, color: "#fff", border: "none", borderRadius: 4, cursor: loading ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: loading ? 0.7 : 1 }}>
                {loading ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Matching…</> : <><Brain size={14} /> Find Matches</>}
              </button>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

// ── Main sidebar ────────────────────────────────────────────────
const TOOLS = [
  { id: "matching"   as const, icon: Brain,       label: "AI Investor Matching",   desc: "Find your best-fit investors instantly",  stat: "Real investor data" },
  { id: "pitch"      as const, icon: Sparkles,    label: "Pitch Analyzer",          desc: "Score your deck across 5 dimensions",   stat: "~3 seconds" },
  { id: "diligence"  as const, icon: FileSearch,  label: "Due Diligence Report",    desc: "500-word AI memo on any startup",        stat: "$29 · Free for Pro" },
];

function AiSidePanelInner() {
  const [active, setActive] = useState<"matching" | "pitch" | "diligence" | null>(null);

  return (
    <>
      <div style={{ position: "sticky", top: 80, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Header */}
        <div style={{ background: "#141A12", border: "1px solid rgba(181,101,29,0.2)", borderRadius: 6, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 4, background: "rgba(181,101,29,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Brain size={14} style={{ color: "#B5651D" }} />
            </div>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 13, color: "#E8E4DC" }}>AI Deal Tools</span>
          </div>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 300, fontSize: 12, color: "#7A8A7C", lineHeight: 1.6 }}>
            GPT-4o-mini — match investors, analyse pitches, generate due diligence.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8 }}>
            <Zap size={11} style={{ color: "#B5651D" }} />
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 500, color: "#9AA89C" }}>Real DB data · No fake results</span>
          </div>
        </div>

        {/* Tool cards */}
        {TOOLS.map(t => (
          <div key={t.id} style={{ background: C.paper, border: `1px solid ${C.ruleMid}`, borderRadius: 6, overflow: "hidden" }}>
            <div style={{ height: 3, background: `linear-gradient(90deg, ${C.copper}, #8B4513)` }} />
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 4, background: C.copperBg, border: `1px solid ${C.copperBr}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <t.icon size={15} style={{ color: C.copper }} />
                </div>
                <span style={{ background: C.copperBg, border: `1px solid ${C.copperBr}`, borderRadius: 3, padding: "2px 8px", fontFamily: "'DM Sans',sans-serif", fontWeight: 500, fontSize: 10, color: C.copper }}>{t.stat}</span>
              </div>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 13, color: C.ink, marginBottom: 3 }}>{t.label}</p>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 300, fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>{t.desc}</p>
              <button onClick={() => setActive(t.id)}
                style={{ width: "100%", height: 36, background: C.copper, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                Try it now <ArrowRight size={12} />
              </button>
            </div>
          </div>
        ))}

        {/* Upgrade nudge */}
        <Link href="/pricing" style={{ display: "block", background: "rgba(181,101,29,0.06)", border: "1px solid rgba(181,101,29,0.18)", borderRadius: 6, padding: "12px 14px", textDecoration: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <TrendingUp size={14} style={{ color: C.copper, flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 12, color: C.ink2 }}>Unlock unlimited AI</p>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 300, fontSize: 11, color: C.muted }}>Angel $99/mo · Pro $299/mo</p>
            </div>
          </div>
        </Link>
      </div>

      {active === "pitch"     && <PitchModal onClose={() => setActive(null)} />}
      {active === "diligence" && <DueDiligenceModal onClose={() => setActive(null)} />}
      {active === "matching"  && <MatchingModal onClose={() => setActive(null)} />}
    </>
  );
}

export const AiSidePanel = memo(AiSidePanelInner);
