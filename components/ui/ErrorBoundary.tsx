"use client";

import { Component, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  children: ReactNode;
  /** Replaces the default panel — use when the surrounding layout needs a specific shape. */
  fallback?: ReactNode;
  /** Translation key naming what broke, resolved inside the default panel. */
  labelKey?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Component-level boundary, for wrapping a *section* rather than a route.
 *
 * app/error.tsx already catches anything a route throws, but it replaces the
 * entire page. That is the wrong trade for a dashboard made of independent
 * widgets: if the activity feed throws, the pipeline, the stats and the nav
 * should all still work. This contains the damage to one panel.
 *
 * Still a class component because `getDerivedStateFromError` has no hook
 * equivalent — this is the one place React still requires one.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[ErrorBoundary]", this.props.labelKey ?? "", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return <SectionFallback labelKey={this.props.labelKey} onRetry={() => this.setState({ hasError: false })} />;
  }
}

// Hooks are unusable inside the class, so the translated fallback lives here.
function SectionFallback({ labelKey, onRetry }: { labelKey?: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", textAlign: "center",
        padding: "40px 24px", minHeight: "180px",
        background: "var(--cr-paper-2)",
        border: "1px solid var(--cr-rule-dark)",
        borderRadius: "4px",
      }}
    >
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "22px", color: "var(--cr-paper-4)", marginBottom: "10px", lineHeight: 1 }}>
        ◆
      </div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)", marginBottom: "4px" }}>
        {labelKey ? t("errorPage.sectionNamed", { name: t(labelKey) }) : t("errorPage.sectionTitle")}
      </p>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginBottom: "16px", maxWidth: "260px", lineHeight: 1.5 }}>
        {t("errorPage.sectionBody")}
      </p>
      {/* Deliberately re-renders this subtree rather than reloading the page:
          a full reload would throw away whatever the user was doing in the
          panels that did not break. */}
      <button
        onClick={onRetry}
        style={{
          height: "32px", padding: "0 16px", background: "transparent",
          border: "1px solid var(--cr-rule-dark)", borderRadius: "4px",
          cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          fontWeight: 500, fontSize: "12px", color: "var(--cr-ink-3)",
        }}
      >
        {t("errorPage.retry")}
      </button>
    </div>
  );
}
