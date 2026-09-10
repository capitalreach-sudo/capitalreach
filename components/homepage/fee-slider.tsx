"use client";
import { BROKER_BENCHMARK_PERCENT } from "@/lib/circumvention-text";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * The 2% made tangible: drag the raise, watch the fee -- and watch what a
 * traditional 6% broker would have taken from the same round. Pure client
 * math over the pricing the proof strip already states; the slider just lets
 * a founder feel it with their own number. Reuses the feeCalc locale keys the
 * listing calculator shipped with (all fifteen languages, day one).
 *
 * Everything here sits on --cr-band-bg, which is a dark slab in all four
 * theme combinations, so colours are mixed against --cr-band-ink rather than
 * --cr-ink: the page palette flips between light and dark, the band does not.
 */
const STEPS = [100_000, 250_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000, 7_500_000, 10_000_000];
const LAST = STEPS.length - 1;

const OUR_PCT = 2;
const BROKER_PCT = BROKER_BENCHMARK_PERCENT;
const SAVED_PCT = BROKER_PCT - OUR_PCT;
/** Our fee drawn on a track whose full width is the broker's, so the two bars
 *  are comparable by length alone. */
const OUR_SHARE = (OUR_PCT / BROKER_PCT) * 100;

/** Steps that get a printed label under the scale. */
const ANCHORS = [0, 4, 8, 10];

/** The .cr-range thumb is 18px, so the handle centre never reaches either end
 *  of the input's box. Any scale drawn alongside has to carry the same
 *  half-thumb inset or its ticks point at the wrong values. */
const THUMB_INSET = "9px";

/** Copper and --cr-up are tuned for a light page; on the always-dark band they
 *  sit near 3:1, which is under the floor for anything smaller than a display
 *  figure. Lifting each toward --cr-band-ink keeps the hue and buys the
 *  contrast, in every theme, without naming a colour. */
const UP_ON_BAND = "color-mix(in srgb, var(--cr-up) 72%, var(--cr-band-ink))";
const COPPER_ON_BAND = "color-mix(in srgb, var(--cr-copper) 78%, var(--cr-band-ink))";

const PANEL_BG = "color-mix(in srgb, var(--cr-band-ink) 4%, transparent)";
const RULE_ON_BAND = "color-mix(in srgb, var(--cr-band-ink) 12%, transparent)";
const EDGE_ON_BAND = "color-mix(in srgb, var(--cr-band-ink) 10%, transparent)";
const TRACK_ON_BAND = "color-mix(in srgb, var(--cr-band-ink) 8%, transparent)";
const BROKER_ON_BAND = "color-mix(in srgb, var(--cr-band-ink) 30%, transparent)";
const TICK_ON_BAND = "color-mix(in srgb, var(--cr-band-ink) 25%, transparent)";
const RING = "0 0 0 2px var(--cr-band-bg), 0 0 0 4px color-mix(in srgb, var(--cr-copper) 65%, transparent)";

const MONO = { fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" as const };
const LABEL = {
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 500,
  fontSize: "11px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

/** Rounds to the nearest thousand before choosing the unit, so a value passing
 *  through 999,600 mid-roll reads "$1M" and never "$1000k". */
function money(n: number): string {
  const k = Math.round(n / 1000);
  return k >= 1000 ? `$${(k / 1000).toFixed(k % 1000 ? 1 : 0)}M` : `$${k}k`;
}

/**
 * Eases the displayed figure toward the handle's value so the numbers roll
 * rather than jump. Each new target picks up from wherever the last roll had
 * got to, which is what makes a fast drag read as one continuous movement
 * instead of a queue of animations.
 */
function useRolledValue(target: number, animate: boolean): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    if (!animate) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const from = shownRef.current;
    if (from === target) return;

    const start = performance.now();
    let frame = requestAnimationFrame(function step(now: number) {
      const p = Math.min(1, (now - start) / 320);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = p === 1 ? target : from + (target - from) * eased;
      shownRef.current = next;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, animate]);

  return shown;
}

export function FeeSlider() {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(4); // $1M default
  const [animate, setAnimate] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [sliderRing, setSliderRing] = useState(false);
  const [anchorRing, setAnchorRing] = useState<number | null>(null);

  // Starts false so the server pass and the first paint are static, then the
  // query decides. Nothing here animates before the effect has run.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAnimate(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // A pointer released outside the input still ends the drag.
  useEffect(() => {
    if (!dragging) return;
    const end = () => setDragging(false);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [dragging]);

  const raise = STEPS[idx];
  const shownRaise = useRolledValue(raise, animate);
  const ours = (shownRaise * OUR_PCT) / 100;
  const broker = (shownRaise * BROKER_PCT) / 100;

  const ease = animate ? "220ms cubic-bezier(0.22, 0.61, 0.36, 1)" : "0ms";

  // :focus-visible cannot be expressed inline, and .cr-range clears the UA
  // outline for every browser while only restoring a ring on WebKit thumbs.
  // Asking the element itself keeps the keyboard ring honest everywhere.
  const isKeyboardFocus = (el: Element) => {
    try {
      return el.matches(":focus-visible");
    } catch {
      return true;
    }
  };

  const rows = [
    { key: "ours", label: t("feeCalc.rowCapitalReach", { fee: OUR_PCT }), value: ours, primary: true },
    { key: "broker", label: t("feeCalc.rowBroker", { fee: BROKER_PCT }), value: broker, primary: false },
  ];

  return (
    <section aria-label={t("feeCalc.title")} style={{ background: "var(--cr-band-bg)", borderTop: "1px solid var(--cr-copper-br)", borderBottom: "1px solid var(--cr-copper-br)" }}>
      <div className="max-w-[880px] mx-auto px-6 md:px-10 py-12 md:py-16">
        <div className="ruled-label" style={{ marginBottom: "24px" }}>{t("feeCalc.title")}</div>

        <div
          className="p-4 md:p-6"
          style={{
            background: PANEL_BG,
            border: `1px solid ${RULE_ON_BAND}`,
            borderRadius: "var(--radius)",
            boxShadow: `inset 0 1px 0 ${EDGE_ON_BAND}`,
          }}
        >
          {/* Input: the figure is the readout of the handle, not a heading. */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <span style={{ ...LABEL, fontSize: "10px", color: "var(--cr-band-ink-dim)" }}>{t("feeCalc.inputRaise")}</span>
            <span
              style={{
                ...MONO,
                fontWeight: 700,
                fontSize: "28px",
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                color: dragging ? COPPER_ON_BAND : "var(--cr-band-ink)",
                transition: `color ${ease}`,
              }}
            >
              {money(shownRaise)}
            </span>
          </div>

          <div
            style={{
              marginTop: "8px",
              borderRadius: "var(--radius)",
              boxShadow: sliderRing ? RING : "none",
              transition: `box-shadow ${ease}`,
            }}
          >
            <input
              type="range" min={0} max={LAST} step={1} value={idx}
              onChange={(e) => setIdx(Number(e.target.value))}
              onPointerDown={() => setDragging(true)}
              onFocus={(e) => setSliderRing(isKeyboardFocus(e.currentTarget))}
              onBlur={() => setSliderRing(false)}
              aria-label={t("feeCalc.inputRaise")}
              aria-valuetext={money(raise)}
              className="cr-range"
              style={{ display: "block", cursor: dragging ? "grabbing" : "grab", "--fill": `${(idx / LAST) * 100}%` } as React.CSSProperties}
            />
          </div>

          {/* Machined scale: every step is a tick, the ones behind the handle
              are lit, the labelled ones stand taller. */}
          <div aria-hidden="true" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", height: "10px", paddingInline: THUMB_INSET }}>
            {STEPS.map((step, i) => (
              <span
                key={step}
                style={{
                  width: "1px",
                  height: ANCHORS.includes(i) ? "10px" : i <= idx ? "7px" : "4px",
                  backgroundColor: i <= idx ? "var(--cr-copper)" : TICK_ON_BAND,
                  transition: `height ${ease}, background-color ${ease}`,
                }}
              />
            ))}
          </div>

          {/* Anchors sit in zero-width flex boxes so each centres on its own
              percentage without a transform, and the outer two align to their
              end of the scale instead of overhanging it. Logical properties
              keep the whole scale correct under dir="rtl". */}
          <div style={{ position: "relative", height: "40px", marginInline: THUMB_INSET, marginTop: "4px" }}>
            {ANCHORS.map((i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: 0,
                  insetInlineStart: `${(i / LAST) * 100}%`,
                  width: 0,
                  display: "flex",
                  justifyContent: i === 0 ? "flex-start" : i === LAST ? "flex-end" : "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => setIdx(i)}
                  onFocus={(e) => setAnchorRing(isKeyboardFocus(e.currentTarget) ? i : null)}
                  onBlur={() => setAnchorRing(null)}
                  aria-label={t("feeCalc.setRaise", { amount: money(STEPS[i]) })}
                  style={{
                    ...MONO,
                    fontWeight: 500,
                    fontSize: "10px",
                    letterSpacing: "0.04em",
                    whiteSpace: "nowrap",
                    color: idx === i ? "var(--cr-band-ink)" : "var(--cr-band-ink-dim)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "8px 4px",
                    minHeight: "40px",
                    display: "flex",
                    alignItems: "center",
                    borderRadius: "var(--radius)",
                    boxShadow: anchorRing === i ? RING : "none",
                    transition: `color ${ease}`,
                  }}
                >
                  {money(STEPS[i])}
                </button>
              </div>
            ))}
          </div>

          <div style={{ height: "1px", background: RULE_ON_BAND, marginTop: "8px" }} />

          {/* The saving is the argument, so it gets the display figure and the
              only colour on the panel. */}
          <div style={{ marginTop: "24px" }}>
            <div style={{ ...LABEL, color: "var(--cr-band-ink-dim)" }}>{t("feeCalc.rowSave")}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "16px", flexWrap: "wrap", marginTop: "8px" }}>
              <span
                style={{
                  ...MONO,
                  fontWeight: 700,
                  fontSize: "clamp(36px, 10vw, 52px)",
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                  color: UP_ON_BAND,
                }}
              >
                {money(broker - ours)}
              </span>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", lineHeight: 1.65, color: "var(--cr-band-ink-dim)", maxWidth: "26ch" }}>
                {t("feeCalc.keepShare", { pct: SAVED_PCT })}
              </p>
            </div>
          </div>

          {/* Both bars are measured against the broker's 6%, and they stack, so
              the empty two thirds of our bar sits directly over the two thirds
              of theirs that the saving is made of. */}
          <div style={{ marginTop: "24px", display: "grid", gap: "16px" }}>
            {rows.map((row) => (
              <div key={row.key}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
                  <span style={{ ...LABEL, color: row.primary ? "var(--cr-band-ink)" : "var(--cr-band-ink-dim)" }}>{row.label}</span>
                  <span style={{ ...MONO, fontWeight: 700, fontSize: "15px", color: row.primary ? "var(--cr-band-ink)" : "var(--cr-band-ink-dim)" }}>
                    {money(row.value)}
                  </span>
                </div>
                <div style={{ display: "flex", height: "8px", borderRadius: "var(--radius)", background: TRACK_ON_BAND, overflow: "hidden" }}>
                  <div style={{ width: `${OUR_SHARE.toFixed(3)}%`, background: row.primary ? "var(--cr-copper)" : BROKER_ON_BAND }} />
                  {!row.primary && <div style={{ flex: 1, background: UP_ON_BAND }} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
