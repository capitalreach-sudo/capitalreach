// Regulatory micro-disclaimer.
//
// The footer carries "not a registered broker-dealer", but that wording needs
// to appear anywhere financial data is actually shown — not only in the footer
// where a user browsing listings never scrolls to it. Terms §2 and §6 state
// CapitalReach is not a broker-dealer or adviser and that AI output is
// informational; these components put that in front of the reader at the point
// the claim matters.

export function LegalDisclaimer({ variant = "default" }: { variant?: "default" | "ai" }) {
  const text = variant === "ai"
    ? "AI-generated analysis is for informational purposes only. It does not constitute investment advice, formal due diligence, or a recommendation to invest. Always conduct your own independent research."
    : "CapitalReach is not a registered broker-dealer or investment adviser. Information shown is for reference only and does not constitute investment advice.";

  return (
    <p style={{
      fontFamily: "'DM Sans', sans-serif",
      fontWeight: 300,
      fontSize: "11px",
      color: "var(--cr-ink-4)",
      lineHeight: 1.6,
      marginTop: "24px",
    }}>
      {text}
    </p>
  );
}

/**
 * Prominent variant for AI reports — the Terms call this output "informational
 * only", but the UI labels it "due diligence", which reads as something far
 * more formal than it is. This sits at the top of a generated report.
 */
export function AiReportDisclaimer() {
  return (
    <div style={{
      background: "var(--cr-copper-bg)",
      border: "1px solid var(--cr-copper-br)",
      borderRadius: "6px",
      padding: "14px 16px",
      marginBottom: "20px",
    }}>
      <p style={{
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 300,
        fontSize: "12px",
        color: "var(--cr-ink-3)",
        lineHeight: 1.65,
      }}>
        This AI-generated analysis is for informational purposes only and does not
        constitute investment advice, due diligence, or a recommendation to invest.
        Always conduct your own independent research.
      </p>
    </div>
  );
}
