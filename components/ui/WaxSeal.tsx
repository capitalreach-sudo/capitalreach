"use client";

/**
 * The signature moment: a verdigris wax seal stamped onto a closed deal.
 * Copper that has matured. Pure SVG; the stamp animation runs once (callers
 * gate on first render via `stamp`), reduced motion lands it instantly.
 */
export function WaxSeal({ size = 96, date, stamp = false }: { size?: number; date?: string; stamp?: boolean }) {
  // Scalloped outer edge: a circle with sine-perturbed radius, 24 bumps.
  const bumps = 24;
  const pts = Array.from({ length: 360 }, (_, t) => {
    const rad = (t / 360) * Math.PI * 2;
    const r = 46 + 2.4 * Math.sin(bumps * rad);
    return `${(50 + r * Math.cos(rad)).toFixed(2)},${(50 + r * Math.sin(rad)).toFixed(2)}`;
  });
  const ring = date ? `CLOSED · ${date} · §6 · ` : "CLOSED · CAPITALREACH · §6 · ";
  return (
    <span style={{ display: "inline-block", width: size, height: size, animation: stamp ? "sealStamp 260ms cubic-bezier(.34,1.56,.64,1) both" : undefined }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={ring.trim()}>
        <path d={`M ${pts.join(" L ")} Z`} fill="var(--verdigris)" />
        <circle cx="50" cy="50" r="34" fill="none" stroke="var(--cr-paper)" strokeWidth="0.8" opacity="0.55" />
        <defs>
          <path id="seal-ring" d="M 50,50 m -28,0 a 28,28 0 1,1 56,0 a 28,28 0 1,1 -56,0" />
        </defs>
        <text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "6.4px", letterSpacing: "0.14em", fill: "var(--cr-paper)" }}>
          <textPath href="#seal-ring">{ring.repeat(2)}</textPath>
        </text>
        <text x="50" y="54" textAnchor="middle" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", fill: "var(--cr-paper)" }}>{"◆"}</text>
      </svg>
    </span>
  );
}
