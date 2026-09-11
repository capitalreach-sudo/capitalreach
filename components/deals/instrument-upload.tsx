"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";
import { formatMoney } from "@/lib/currency";

/**
 * The signed instrument, beside the number the pair declared.
 *
 * This panel exists to make a disagreement FIXABLE rather than accusatory. It
 * puts both figures on the same line for both sides, says in plain words that
 * nothing is charged and nobody is marked on the strength of it, and treats a
 * document that could not be read as a document that could not be read -- the
 * commonest reason a check comes back empty is a scanned PDF, which is not
 * evidence about anybody's round.
 *
 * Everything shown here is read back from the server. The verdict columns carry
 * a database trigger that refuses a client-key write (125), so nothing on this
 * surface can put a status on a deal; it asks, and it renders the answer.
 */

/** Mirrors the route's own ceiling, so an oversized file is refused here with a
 *  specific reason instead of after a ten-megabyte upload. */
const MAX_BYTES = 10 * 1024 * 1024;

const LABEL: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)",
};

const BODY: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px",
  color: "var(--cr-ink-3)", lineHeight: 1.7,
};

const MONO: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: "11px",
  color: "var(--cr-ink-4)", fontVariantNumeric: "tabular-nums",
};

const FIGURE: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: "17px", fontWeight: 500,
  color: "var(--cr-ink)", fontVariantNumeric: "tabular-nums", marginTop: "6px",
};

const ACTION: CSSProperties = { fontSize: "13px", padding: "9px 18px", minHeight: "40px" };

interface Panel {
  party: "startup" | "investor" | null;
  canUpload: boolean;
  hasInstrument: boolean;
  status: string;
  declaredAmount: number | null;
  declaredCurrency: string;
  /** No currency travels with this one: 125 stores the figure and nothing
   *  beside it. Rendered bare unless a run in this session read one. */
  extractedAmount: number | null;
}

interface RunResult {
  status: string;
  read: boolean;
  messageKey: string;
  message: string;
  declaredAmount: number | null;
  declaredCurrency: string;
  extractedAmount: number | null;
  extractedCurrency: string | null;
}

/** Verdigris is the settled state and copper asks for attention. Green and red
 *  are reserved for money direction and would say the wrong thing here. */
function statusColor(status: string): string {
  if (status === "matched" || status === "admin_cleared") return "var(--verdigris)";
  if (status === "mismatch") return "var(--cr-copper)";
  return "var(--cr-ink-4)";
}

export function InstrumentUpload({ dealId, onChanged }: { dealId: string; onChanged?: () => void }) {
  const { t, locale } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<Panel | null>(null);
  const [failed, setFailed] = useState(false);
  // A deal somebody is not party to has no panel at all. A retry box would tell
  // them there is something here that is merely broken.
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals/${dealId}/instrument`);
      if (res.status === 403 || res.status === 404) { setHidden(true); return; }
      if (!res.ok) { setFailed(true); return; }
      setFailed(false);
      setData((await res.json()) as Panel);
    } catch {
      setFailed(true);
    }
  }, [dealId]);

  useEffect(() => { void load(); }, [load]);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/reconcile`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(json.messageKey ? t(json.messageKey) : json.error || t("errors.generic"));
        return;
      }
      const result = json as RunResult;
      setRun(result);
      // A disagreement is news, not a failure of the person reading it, and a
      // document that could not be read is neither. Only agreement is a win.
      if (result.status === "matched" && result.read) notify.success(t(result.messageKey));
      else notify.info(t(result.messageKey));
      await load();
      onChanged?.();
    } catch {
      notify.error(t("errors.generic"));
    } finally {
      setChecking(false);
    }
  }, [dealId, t, load, onChanged]);

  async function upload(file: File) {
    // Checked here for a fast, specific answer; the route enforces both again,
    // and additionally reads the file's own header.
    if (file.type !== "application/pdf") { notify.error(t("instrument.pdfOnly")); return; }
    if (file.size > MAX_BYTES) { notify.error(t("instrument.tooLarge")); return; }

    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/deals/${dealId}/instrument`, { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(json.messageKey ? t(json.messageKey) : json.error || t("errors.generic"));
        return;
      }
      // The previous reading belonged to the previous document.
      setRun(null);
      notify.success(t("instrument.uploaded"));
      await load();
      onChanged?.();
    } catch {
      notify.error(t("errors.generic"));
      return;
    } finally {
      setBusy(false);
    }
    // Read straight away. Uploading and then finding the panel inert teaches
    // nobody that the document was a scan, which is the one thing the person
    // who just chose the file is best placed to fix.
    await check();
  }

  if (hidden) return null;

  if (failed) {
    return (
      <div style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
        <p style={{ ...BODY, margin: 0 }}>{t("instrument.loadFailed")}</p>
        <button type="button" onClick={() => void load()} className="btn-ghost" style={{ ...ACTION, marginTop: "16px" }}>
          {t("data.retry")}
        </button>
      </div>
    );
  }
  if (!data) return null;

  const declaredAmount = run?.declaredAmount ?? data.declaredAmount;
  const declaredCurrency = run?.declaredCurrency ?? data.declaredCurrency;
  const extractedAmount = run?.extractedAmount ?? data.extractedAmount;
  const extractedCurrency = run?.extractedCurrency ?? null;

  // Named rather than dashed. A deal with no agreed figure yet is a state, and
  // the panel says which one instead of leaving a mark for the reader to guess.
  const declaredText = declaredAmount === null
    ? t("instrument.notDeclared")
    : formatMoney(declaredAmount, declaredCurrency);

  // With a currency it is money; without one it is a figure taken off a page,
  // and it is shown as exactly that rather than borrowed into the deal's own
  // currency. Two identical numbers in different currencies are two different
  // rounds, which is the mistake this whole panel exists to surface.
  const extractedText = extractedAmount === null
    ? t("instrument.notRead")
    : extractedCurrency
      ? formatMoney(extractedAmount, extractedCurrency)
      : extractedAmount.toLocaleString(locale);

  const working = busy || checking;

  return (
    <div style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", overflow: "hidden" }}>
      <div style={{ padding: "24px", borderBottom: "1px solid var(--cr-rule)" }}>
        <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("instrument.eyebrow")}</div>
        <h3 style={{
          fontFamily: "var(--font-serif)", fontWeight: 700, fontStyle: "italic",
          fontSize: "clamp(18px, 2.6vw, 22px)", color: "var(--cr-ink)",
          letterSpacing: "-0.01em", margin: 0, textWrap: "balance",
        }}>
          {t("instrument.title")}
        </h3>
        <p style={{ ...BODY, marginTop: "12px", marginBottom: 0, maxWidth: "62ch" }}>
          {t("instrument.body")}
        </p>
      </div>

      {/* Both figures, side by side, for whichever side is reading. */}
      <div style={{ padding: "24px", borderBottom: "1px solid var(--cr-rule)", display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px", padding: "16px", background: "var(--cr-paper-2)", borderRadius: "4px", border: "1px solid var(--cr-rule)" }}>
          <div style={LABEL}>{t("instrument.declared")}</div>
          <div style={FIGURE}>{declaredText}</div>
        </div>
        <div style={{ flex: "1 1 200px", padding: "16px", background: "var(--cr-paper-2)", borderRadius: "4px", border: "1px solid var(--cr-rule)" }}>
          <div style={LABEL}>{t("instrument.inDocument")}</div>
          <div style={{ ...FIGURE, color: extractedAmount === null ? "var(--cr-ink-4)" : "var(--cr-ink)" }}>
            {extractedText}
          </div>
        </div>
      </div>

      <div style={{ padding: "24px", borderBottom: "1px solid var(--cr-rule)" }}>
        <div style={{ ...LABEL, color: statusColor(data.status) }}>
          {t(`instrument.status_${data.status}`)}
        </div>
        {run && (
          <p style={{ ...BODY, marginTop: "8px", marginBottom: 0, maxWidth: "62ch" }}>
            {t(run.messageKey)}
          </p>
        )}
        {/* The consequence, stated next to the finding. A founder who reads
            "mismatch" and is told nothing else assumes the worst of it. */}
        {data.status === "mismatch" && (
          <p style={{ ...BODY, marginTop: "12px", marginBottom: 0, maxWidth: "62ch", display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <span aria-hidden style={{ color: "var(--cr-copper)", flexShrink: 0 }}>{"✦"}</span>
            <span>{t("instrument.mismatchHelp")}</span>
          </p>
        )}
      </div>

      <div style={{ padding: "24px" }}>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            // Reset first: choosing the same file twice must still fire.
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          {data.canUpload && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={working}
              className="btn-ghost"
              style={{ ...ACTION, opacity: working ? 0.5 : 1 }}
            >
              {busy
                ? t("instrument.uploading")
                : data.hasInstrument ? t("instrument.replace") : t("instrument.upload")}
            </button>
          )}
          {data.hasInstrument && (
            <>
              <button
                type="button"
                onClick={() => void check()}
                disabled={working}
                className="btn-ghost"
                style={{ ...ACTION, opacity: working ? 0.5 : 1 }}
              >
                {checking ? t("instrument.checking") : t("instrument.check")}
              </button>
              {/* Straight at the route, which re-authorises and mints a
                  sixty-second URL per click. The page never holds one. */}
              <a
                href={`/api/deals/${dealId}/instrument?open=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
                style={{ ...ACTION, display: "inline-flex", alignItems: "center", textDecoration: "none" }}
              >
                {t("instrument.view")}
              </a>
            </>
          )}
        </div>
        <p style={{ ...MONO, marginTop: "12px" }}>{t("instrument.rules")}</p>
      </div>
    </div>
  );
}
