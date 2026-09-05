"use client";

/**
 * Guilloche: the interlocking curve pattern on banknotes. It says "capital"
 * without a word. Procedural Lissajous curves, stroke follows currentColor
 * so every register paints its own. Texture, never decoration -- callers
 * stay at or below opacity 0.12.
 */
export function Guilloche({
  className, seed = 1, lines = 24, opacity = 0.08, spin = false,
}: { className?: string; seed?: number; lines?: number; opacity?: number; spin?: boolean }) {
  const paths = Array.from({ length: lines }, (_, i) => {
    const a = 3 + (i % 5);
    const b = 2 + (i % 7);
    const phase = (i * seed * 0.37) % (Math.PI * 2);
    const points = Array.from({ length: 180 }, (_, t) => {
      const rad = (t / 180) * Math.PI * 2;
      const x = 50 + 45 * Math.sin(a * rad + phase);
      const y = 50 + 45 * Math.sin(b * rad);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return `M ${points.join(" L ")} Z`;
  });
  return (
    <svg viewBox="0 0 100 100" className={`${className ?? ""} ${spin ? "guilloche-spin" : ""}`.trim()}
      preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="0.15" opacity={opacity} />
      ))}
    </svg>
  );
}
