"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";
import { WaxSeal } from "@/components/ui/WaxSeal";

/**
 * Where a deal becomes a record both sides signed.
 *
 * An accepted offer is one party's yes. This is the countersignature, and it
 * is what opens the conversation and stops the platform withholding the pair's
 * contact details. Until both names are here they can still make offers,
 * counter, ask questions and request documents; what waits is the
 * unstructured channel.
 *
 * The document is fetched rather than composed here, and the hash shown is
 * the server's hash of the exact bytes on screen. A signing surface that
 * rendered its own version of the agreement would be signing something the
 * record cannot reproduce.
 */

const LABEL: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)",
};

const BODY: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px",
  color: "var(--cr-ink-3)", lineHeight: 1.7,
};

const MONO: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: "11px",
  color: "var(--cr-ink-4)", fontVariantNumeric: "tabular-nums", wordBreak: "break-all",
};

interface Signature { signedAt: string; name: string }

interface SealPayload {
  dealId: string;
  party: "startup" | "investor";
  companyName: string | null;
  text: string;
  version: string;
  sha256: string;
  sealed: boolean;
  sealedAt: string | null;
  startup: Signature | null;
  investor: Signature | null;
  mine: Signature | null;
  theirs: Signature | null;
}

function day(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function DealSeal({ dealId, onSealed }: { dealId: string; onSealed?: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<SealPayload | null>(null);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [failed, setFailed] = useState(false);
  // The countersignature that seals a deal happens once, ever, and the panel
  // it happens in is replaced wholesale by the record. `sealing` holds the
  // signing form on screen for the length of its own exit so the swap reads
  // as one thing giving way to another rather than a cut.
  const [sealing, setSealing] = useState(false);
  const SEAL_EXIT_MS = 200;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals/seal?dealId=${dealId}`);
      if (!res.ok) { setFailed(true); return; }
      setFailed(false);
      setData((await res.json()) as SealPayload);
    } catch {
      setFailed(true);
    }
  }, [dealId]);
  useEffect(() => { void load(); }, [load]);

  async function sign() {
    if (!agreed) { notify.error(t("seal.mustAgree")); return; }
    if (name.trim().length < 2) { notify.error(t("seal.nameRequired")); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/deals/seal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, signedName: name.trim(), agreed: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { notify.error(j.messageKey ? t(j.messageKey) : (j.error || t("seal.failed"))); return; }
      if (j.sealed) {
        // Let the form leave before the seal lands on top of it. The wait is
        // the exit's own length, and it is the only deliberately slow moment
        // on this surface -- once per deal, and it is the deal being made.
        setSealing(true);
        // The global reduced-motion rule collapses the CSS transition, but a
        // setTimeout survives it. Without this check the exit becomes 200ms of
        // an empty panel for exactly the people who asked for less motion.
        const still = typeof matchMedia === "function"
          && matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!still) await new Promise(r => setTimeout(r, SEAL_EXIT_MS));
        await load();
        setSealing(false);
        notify.success(t("seal.sealed"));
        onSealed?.();
      } else {
        await load();
        notify.success(t("seal.signed"));
      }
    } catch {
      setSealing(false);
      notify.error(t("seal.failed"));
    } finally {
      setBusy(false);
    }
  }

  // Three states worth telling apart, and the failure must never look like
  // "nothing to sign here".
  if (failed) {
    return (
      <div style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
        <p style={{ ...BODY, margin: 0 }}>{t("seal.loadFailed")}</p>
        <button type="button" onClick={() => void load()} style={{
          marginTop: "16px", background: "none", border: "1px solid var(--cr-rule-dark)",
          borderRadius: "999px", minHeight: "40px", padding: "0 20px", cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)",
        }}>{t("data.retry")}</button>
      </div>
    );
  }
  if (!data) return null;

  const Slot = ({ who, sig }: { who: string; sig: Signature | null }) => (
    <div style={{ flex: "1 1 200px", padding: "16px", background: "var(--cr-paper-2)", borderRadius: "4px", border: "1px solid var(--cr-rule)" }}>
      <div style={LABEL}>{who}</div>
      {sig ? (
        <>
          <div style={{
            fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 600,
            fontSize: "18px", color: "var(--cr-ink)", marginTop: "8px",
          }}>{sig.name}</div>
          <div style={{ ...MONO, marginTop: "4px" }}>{day(sig.signedAt)}</div>
        </>
      ) : (
        <div style={{ ...BODY, fontSize: "13px", marginTop: "8px" }}>{t("seal.unsigned")}</div>
      )}
    </div>
  );

  return (
    <div style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", overflow: "hidden" }}>
      <div style={{ padding: "24px", borderBottom: "1px solid var(--cr-rule)" }}>
        <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("seal.eyebrow")}</div>
        <h3 style={{
          fontFamily: "var(--font-serif)", fontWeight: 700, fontStyle: "italic",
          fontSize: "clamp(20px, 3vw, 26px)", color: "var(--cr-ink)",
          letterSpacing: "-0.01em", margin: 0, textWrap: "balance",
        }}>
          {data.sealed ? t("seal.titleSealed") : t("seal.title")}
        </h3>
        <p style={{ ...BODY, marginTop: "12px", marginBottom: 0, maxWidth: "62ch" }}>
          {data.sealed ? t("seal.bodySealed") : t("seal.body")}
        </p>
      </div>

      {/* The document itself. Collapsed by default because it is long, and
          expanded in full before anyone is asked to put their name to it. */}
      <div style={{ padding: "24px", borderBottom: "1px solid var(--cr-rule)" }}>
        <button type="button" onClick={() => setShowFull((v) => !v)} style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px",
          color: "var(--cr-copper)", minHeight: "40px",
        }}>
          {showFull ? t("seal.hideDocument") : t("seal.readDocument")}
        </button>
        {/* Four hundred pixels of contract arriving in one frame shoves the
            signature slots and the button that signs them off the screen.
            0fr to 1fr eases it without measuring anything, and reverses from
            wherever it is if the reader changes their mind halfway. */}
        <div style={{
          display: "grid",
          gridTemplateRows: showFull ? "1fr" : "0fr",
          transition: "grid-template-rows 200ms var(--ease-out)",
        }}>
          <div style={{
            minHeight: 0, overflow: "hidden",
            visibility: showFull ? "visible" : "hidden",
            transition: showFull ? "visibility 0s" : "visibility 0s linear 200ms",
          }}>
            <pre style={{
              marginTop: "16px", padding: "16px", background: "var(--cr-paper-2)",
              border: "1px solid var(--cr-rule)", borderRadius: "4px",
              fontFamily: "'JetBrains Mono', monospace", fontSize: "11.5px",
              lineHeight: 1.7, color: "var(--cr-ink-2)",
              whiteSpace: "pre-wrap", overflowX: "auto", maxHeight: "420px", overflowY: "auto",
            }}>{data.text}</pre>
          </div>
        </div>
        <div style={{ ...MONO, marginTop: "12px" }}>
          {t("seal.version", { version: data.version })} · {data.sha256.slice(0, 16)}
        </div>
      </div>

      <div style={{ padding: "24px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <Slot who={data.companyName || t("seal.theCompany")} sig={data.startup} />
        <Slot who={t("seal.theInvestor")} sig={data.investor} />
      </div>

      {data.sealed ? (
        <div style={{
          padding: "32px 24px", borderTop: "1px solid var(--cr-rule)",
          display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap",
          background: "var(--cr-copper-bg)",
        }}>
          <WaxSeal size={72} date={day(data.sealedAt)} stamp />
          <div style={{ flex: "1 1 240px" }}>
            <div style={{
              fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 600,
              fontSize: "18px", color: "var(--cr-ink)", marginBottom: "6px",
            }}>{t("seal.doneTitle")}</div>
            <p style={{ ...BODY, fontSize: "13px", margin: 0 }}>{t("seal.doneBody")}</p>
          </div>
          <Link href="/dashboard/messages" style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "var(--cr-copper)", border: "1px solid var(--cr-copper-d)",
            borderRadius: "999px", padding: "0 24px", minHeight: "40px",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px",
            color: "var(--cr-band-ink)", textDecoration: "none",
          }}>{t("seal.openConversation")}</Link>
        </div>
      ) : data.mine ? (
        <div style={{ padding: "24px", borderTop: "1px solid var(--cr-rule)" }}>
          <p style={{ ...BODY, margin: 0 }}>{t("seal.waitingOnThem")}</p>
        </div>
      ) : (
        <div style={{
          padding: "24px", borderTop: "1px solid var(--cr-rule)",
          opacity: sealing ? 0 : 1,
          transform: sealing ? "translateY(-6px)" : "none",
          pointerEvents: sealing ? "none" : undefined,
          transition: `opacity ${SEAL_EXIT_MS}ms var(--ease-out), transform ${SEAL_EXIT_MS}ms var(--ease-out)`,
        }}>
          {/* The consequence, next to the asking. Someone reaching this panel
              from a refused message needs the two halves in one place: what
              the signature buys, and that nothing else they can do here is
              being held. */}
          <p style={{ ...BODY, fontSize: "13px", margin: "0 0 24px", maxWidth: "62ch", display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <span aria-hidden style={{ color: "var(--cr-copper)", flexShrink: 0 }}>{"✦"}</span>
            <span>{t("seal.opensMessaging")}</span>
          </p>
          <label style={{ display: "block" }}>
            <span style={LABEL}>{t("seal.yourName")}</span>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t("seal.namePlaceholder")} autoComplete="name"
              style={{
                display: "block", width: "100%", maxWidth: "360px", marginTop: "8px",
                background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)",
                borderRadius: "4px", minHeight: "44px", padding: "0 12px",
                fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "18px",
                color: "var(--cr-ink)",
              }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginTop: "20px", cursor: "pointer" }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
              style={{ accentColor: "var(--cr-copper)", width: 16, height: 16, marginTop: 3, flexShrink: 0, cursor: "pointer" }} />
            <span style={{ ...BODY, fontSize: "13.5px", color: "var(--cr-ink)" }}>{t("seal.checkbox")}</span>
          </label>
          <button type="button" onClick={sign} disabled={busy || !agreed || name.trim().length < 2}
            style={{
              marginTop: "24px", background: "var(--cr-copper)", border: "1px solid var(--cr-copper-d)",
              borderRadius: "999px", padding: "0 28px", minHeight: "44px",
              cursor: busy ? "wait" : "pointer",
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px",
              color: "var(--cr-band-ink)",
              opacity: busy || !agreed || name.trim().length < 2 ? 0.6 : 1,
            }}>
            {busy ? t("seal.signing") : t("seal.sign")}
          </button>
          <p style={{ ...MONO, marginTop: "12px" }}>{t("seal.footer")}</p>
        </div>
      )}
    </div>
  );
}


/**
 * The card-sized version.
 *
 * A deal board can hold dozens of cards and most of them are long since
 * settled, so the full document does not belong on every one. Unsigned, this
 * is the whole panel because it is the only blocking thing on the card.
 * Signed, it collapses to a line and a small seal. Grandfathered (sealed
 * before 120 existed, so no signatures to show) it renders nothing at all
 * rather than claiming a ceremony that never happened.
 */
export function DealSealPanel({ dealId }: { dealId: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<SealPayload | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/deals/seal?dealId=${dealId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j) setState(j as SealPayload); })
      .catch(() => {});
    return () => { live = false; };
  }, [dealId]);

  if (!state) return null;
  if (state.sealed && !state.startup && !state.investor) return null;

  if (state.sealed) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <WaxSeal size={28} />
        <span style={{
          fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px",
          color: "var(--cr-ink-3)",
        }}>
          {t("seal.cardSealed", { date: day(state.sealedAt) })}
        </span>
      </div>
    );
  }
  return <DealSeal dealId={dealId} />;
}
